import { describe, it, expect, afterEach } from "vitest";
import { createFetchHandler } from "../server";
import { storeReply, clearAll } from "../store";

// UUID v4 pattern
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Helper: build a Request against a local URL.
 * The exact hostname doesn't matter — createFetchHandler parses pathname only.
 */
function req(
	method: string,
	path: string,
	body?: unknown,
): Request {
	const url = `http://localhost:4321${path}`;
	const init: RequestInit = { method };
	if (body !== undefined) {
		init.headers = { "Content-Type": "application/json" };
		init.body = JSON.stringify(body);
	}
	return new Request(url, init);
}

describe("integration: HTTP endpoints", () => {
	const handler = createFetchHandler(); // no MCP, no notifier

	afterEach(() => {
		clearAll();
	});

	// -----------------------------------------------------------------------
	// POST /prompt — valid
	// -----------------------------------------------------------------------

	it("POST /prompt with valid body returns 200 and request_id", async () => {
		const res = await handler(
			req("POST", "/prompt", {
				filename: "test.md",
				line: 5,
				query: "what is this?",
			}),
		);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { request_id: string };
		expect(json).toHaveProperty("request_id");
		expect(json.request_id).toMatch(UUID_RE);
	});

	// -----------------------------------------------------------------------
	// POST /prompt — invalid payloads
	// -----------------------------------------------------------------------

	it("POST /prompt with missing fields returns 400", async () => {
		const res = await handler(
			req("POST", "/prompt", { filename: "test.md" }),
		);

		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("Bad request");
	});

	it("POST /prompt with empty query returns 400", async () => {
		const res = await handler(
			req("POST", "/prompt", {
				filename: "test.md",
				line: 1,
				query: "",
			}),
		);

		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("empty");
	});

	it("POST /prompt with whitespace-only query returns 400", async () => {
		const res = await handler(
			req("POST", "/prompt", {
				filename: "test.md",
				line: 1,
				query: "   ",
			}),
		);

		expect(res.status).toBe(400);
	});

	it("POST /prompt with invalid JSON returns 400", async () => {
		const res = await handler(
			new Request("http://localhost:4321/prompt", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			}),
		);

		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("Invalid JSON");
	});

	// -----------------------------------------------------------------------
	// GET /poll — pending
	// -----------------------------------------------------------------------

	it("GET /poll/:id immediately after POST returns pending status", async () => {
		const postRes = await handler(
			req("POST", "/prompt", {
				filename: "note.md",
				line: 10,
				query: "explain this",
			}),
		);
		const { request_id } = (await postRes.json()) as { request_id: string };

		const pollRes = await handler(req("GET", `/poll/${request_id}`));
		expect(pollRes.status).toBe(200);

		const json = (await pollRes.json()) as { status: string };
		expect(json.status).toBe("pending");
	});

	// -----------------------------------------------------------------------
	// GET /poll — after reply
	// -----------------------------------------------------------------------

	it("GET /poll/:id after storeReply returns complete with response", async () => {
		const postRes = await handler(
			req("POST", "/prompt", {
				filename: "note.md",
				line: 1,
				query: "hello",
			}),
		);
		const { request_id } = (await postRes.json()) as { request_id: string };

		// Simulate Claude's reply tool calling storeReply
		const stored = storeReply(request_id, "Hello!");
		expect(stored).toBe(true);

		const pollRes = await handler(req("GET", `/poll/${request_id}`));
		expect(pollRes.status).toBe(200);

		const json = (await pollRes.json()) as {
			status: string;
			response: string;
		};
		expect(json.status).toBe("complete");
		expect(json.response).toBe("Hello!");
	});

	// -----------------------------------------------------------------------
	// GET /poll — unknown ID (404)
	// -----------------------------------------------------------------------

	it("GET /poll/nonexistent-id returns 404", async () => {
		const res = await handler(req("GET", "/poll/nonexistent-id"));
		expect(res.status).toBe(404);

		const json = (await res.json()) as { error: string };
		expect(json.error).toBe("Not found");
	});

	// -----------------------------------------------------------------------
	// GET /health
	// -----------------------------------------------------------------------

	it("GET /health returns 200 ok", async () => {
		const res = await handler(req("GET", "/health"));
		expect(res.status).toBe(200);

		const text = await res.text();
		expect(text).toBe("ok");
	});

	// -----------------------------------------------------------------------
	// Unknown routes (404)
	// -----------------------------------------------------------------------

	it("GET /unknown-route returns 404", async () => {
		const res = await handler(req("GET", "/unknown-route"));
		expect(res.status).toBe(404);
	});

	it("DELETE /prompt returns 404", async () => {
		const res = await handler(
			new Request("http://localhost:4321/prompt", { method: "DELETE" }),
		);
		expect(res.status).toBe(404);
	});

	// -----------------------------------------------------------------------
	// Double-reply via storeReply returns false
	// -----------------------------------------------------------------------

	it("double storeReply returns false and first response is kept", async () => {
		const postRes = await handler(
			req("POST", "/prompt", {
				filename: "f.md",
				line: 1,
				query: "q",
			}),
		);
		const { request_id } = (await postRes.json()) as { request_id: string };

		expect(storeReply(request_id, "first")).toBe(true);
		expect(storeReply(request_id, "second")).toBe(false);

		const pollRes = await handler(req("GET", `/poll/${request_id}`));
		const json = (await pollRes.json()) as { response: string };
		expect(json.response).toBe("first");
	});
});
