/**
 * MCP channel server for Obsidian Chat.
 *
 * Bridges the Obsidian plugin (HTTP) to Claude Code (MCP stdio).
 *
 * - stdio: MCP JSON-RPC with claude/channel capability
 * - HTTP: POST /prompt, GET /poll/:id, GET /health
 *
 * All logging uses console.error — stdout is reserved for MCP JSON-RPC.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createRequest, storeReply, getStatus } from "./store.js";

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new Server(
	{ name: "obsidian-chat", version: "0.1.0" },
	{
		capabilities: {
			tools: {},
			experimental: { "claude/channel": {} },
		},
		instructions: [
			"You are connected to an Obsidian Chat channel.",
			"When you receive a <channel source=\"obsidian-chat\"> event, it contains a user's question from an Obsidian note.",
			"The event meta includes: request_id (unique identifier), filename (the note file), and line (cursor position).",
			"The event content is the user's question.",
			"",
			"You MUST call the reply tool with the request_id from the meta and your response text.",
			"Do not ask follow-up questions — provide a complete answer in a single reply tool call.",
		].join("\n"),
	},
);

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "reply",
			description: "Send a response back to the Obsidian user",
			inputSchema: {
				type: "object" as const,
				properties: {
					request_id: {
						type: "string",
						description: "The request_id from the channel event meta",
					},
					text: {
						type: "string",
						description: "Your response to the user's question",
					},
				},
				required: ["request_id", "text"],
			},
		},
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	if (request.params.name !== "reply") {
		return {
			content: [
				{ type: "text" as const, text: `Unknown tool: ${request.params.name}` },
			],
			isError: true,
		};
	}

	const { request_id, text } = (request.params.arguments ?? {}) as {
		request_id?: string;
		text?: string;
	};

	if (!request_id || !text) {
		console.error("[channel] reply tool called with missing arguments");
		return {
			content: [
				{
					type: "text" as const,
					text: "Missing required arguments: request_id and text",
				},
			],
			isError: true,
		};
	}

	const stored = storeReply(request_id, text);
	if (!stored) {
		console.error(
			`[channel] reply failed for ${request_id} (unknown or already complete)`,
		);
		return {
			content: [
				{
					type: "text" as const,
					text: `Failed to store reply: request ${request_id} not found or already answered`,
				},
			],
			isError: true,
		};
	}

	console.error(`[channel] reply delivered for ${request_id}`);
	return {
		content: [
			{ type: "text" as const, text: `Reply delivered for ${request_id}` },
		],
	};
});

// ---------------------------------------------------------------------------
// Start MCP transport, then HTTP
// ---------------------------------------------------------------------------

let mcpConnected = false;

async function main() {
	// MCP connect must happen before Bun.serve — notifications before connect
	// are silently dropped.
	const transport = new StdioServerTransport();
	await server.connect(transport);
	mcpConnected = true;
	console.error("[channel] MCP connected");

	const port = Number(process.env.PORT) || 4321;

	Bun.serve({
		port,
		hostname: "127.0.0.1",

		async fetch(req: Request): Promise<Response> {
			try {
				const url = new URL(req.url);
				const { pathname } = url;

				// GET /health — liveness probe
				if (req.method === "GET" && pathname === "/health") {
					return new Response("ok", { status: 200 });
				}

				// POST /prompt — create request and notify Claude
				if (req.method === "POST" && pathname === "/prompt") {
					let body: unknown;
					try {
						body = await req.json();
					} catch {
						return Response.json(
							{ error: "Invalid JSON body" },
							{ status: 400 },
						);
					}

					const { filename, line, query } = body as Record<string, unknown>;

					if (
						typeof filename !== "string" ||
						typeof line !== "number" ||
						typeof query !== "string"
					) {
						return Response.json(
							{
								error:
									"Bad request: body must include filename (string), line (number), query (string)",
							},
							{ status: 400 },
						);
					}

					const { request_id } = createRequest(filename, line, query);

					if (mcpConnected) {
						try {
							await server.notification({
								method: "notifications/claude/channel",
								params: {
									content: query,
									meta: {
										request_id,
										filename,
										line: String(line),
									},
								},
							} as any);
							console.error(
								`[channel] request ${request_id} created, notification sent`,
							);
						} catch (err) {
							// Notification failure is non-fatal — the request is still
							// created and can be polled. Claude just won't see it proactively.
							console.error(
								`[channel] request ${request_id} created, notification failed: ${err}`,
							);
						}
					} else {
						console.error(
							`[channel] request ${request_id} created, notification skipped (no MCP)`,
						);
					}

					return Response.json({ request_id }, { status: 200 });
				}

				// GET /poll/:id — check request status
				if (req.method === "GET" && pathname.startsWith("/poll/")) {
					const requestId = pathname.split("/")[2];
					if (!requestId) {
						return Response.json(
							{ error: "Missing request_id" },
							{ status: 400 },
						);
					}

					const status = getStatus(requestId);
					if (!status) {
						return Response.json(
							{ error: "Not found" },
							{ status: 404 },
						);
					}

					return Response.json(status, { status: 200 });
				}

				// Fallback — unknown route
				return Response.json({ error: "Not found" }, { status: 404 });
			} catch (err) {
				console.error(`[channel] HTTP error: ${err}`);
				return Response.json(
					{ error: "Internal server error" },
					{ status: 500 },
				);
			}
		},
	});

	console.error(`[channel] HTTP listening on 127.0.0.1:${port}`);
}

main().catch((err) => {
	console.error(`[channel] fatal: ${err}`);
	process.exit(1);
});
