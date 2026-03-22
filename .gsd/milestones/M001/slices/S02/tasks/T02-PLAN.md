---
estimated_steps: 5
estimated_files: 1
skills_used: []
---

# T02: Build MCP channel server with HTTP endpoints and reply tool

**Slice:** S02 — Channel server with reply tool
**Milestone:** M001

## Description

Build `channel/server.ts` — the single file that wires together the MCP protocol layer (low-level `Server` class with `claude/channel` capability), HTTP endpoints (`POST /prompt`, `GET /poll/:id`, `GET /health`), and the `reply` MCP tool. This is the core deliverable of S02, directly implementing R003 (HTTP endpoint), R005 (MCP bridge), and R006 (reply tool).

The server runs as a standalone Bun process. Claude Code spawns it via the `.mcp.json` registration. stdio handles MCP JSON-RPC; a concurrent `Bun.serve()` handles HTTP from the Obsidian plugin.

**Critical constraints from the channels API:**
- Must use low-level `Server` class from `@modelcontextprotocol/sdk/server/index.js`, NOT `McpServer` — only `Server` supports `experimental['claude/channel']`
- Must use `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`
- `console.log` is forbidden — stdout is MCP JSON-RPC. All logging via `console.error` with `[channel]` prefix
- Notification meta keys must be identifiers (letters, digits, underscores only) — no hyphens
- MCP connect must happen before `Bun.serve()` — notifications before connect are silently dropped
- Tool handler must return `{content: [{type: 'text', text: '...'}]}` format

## Steps

1. Create `channel/server.ts` with imports:
   - `Server` from `@modelcontextprotocol/sdk/server/index.js`
   - `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`
   - `ListToolsRequestSchema`, `CallToolRequestSchema` from `@modelcontextprotocol/sdk/types.js`
   - `createRequest`, `storeReply`, `getStatus`, `getRequestMeta` from `./store.js`
2. Construct `Server` instance:
   - `name: "obsidian-chat"`, `version: "0.1.0"`
   - `capabilities: { experimental: { "claude/channel": {} } }`
   - `instructions`: A multi-line string explaining to Claude that `<channel source="obsidian-chat">` events contain a user question from an Obsidian note with file context (`request_id`, `filename`, `line`). The content is the user's question. Claude must respond by calling the `reply` tool with `request_id` and its response text. Be explicit: "You MUST call the reply tool with the request_id from the meta and your response text."
3. Register MCP tool handlers:
   - `ListToolsRequestSchema` → return `{ tools: [{ name: "reply", description: "Send a response back to the Obsidian user", inputSchema: { type: "object", properties: { request_id: { type: "string", description: "The request_id from the channel event meta" }, text: { type: "string", description: "Your response to the user's question" } }, required: ["request_id", "text"] } }] }`
   - `CallToolRequestSchema` → if `request.params.name === "reply"`, extract `request_id` and `text` from `request.params.arguments`, call `storeReply(request_id, text)`, return success/error content. Log via `console.error`.
4. Connect MCP and start HTTP:
   - `const transport = new StdioServerTransport(); await server.connect(transport);`
   - Set `let mcpConnected = true;` after connect
   - `console.error("[channel] MCP connected");`
   - Start `Bun.serve({ port: Number(process.env.PORT || 4321), hostname: "127.0.0.1", fetch(req) { ... } })`
   - `console.error("[channel] HTTP listening on 127.0.0.1:${port}");`
5. Implement HTTP route handler in the `fetch` function:
   - Parse URL pathname. Use `new URL(req.url)` for routing.
   - `GET /health` → return `new Response("ok", { status: 200 })`
   - `POST /prompt` → validate JSON body has `filename` (string), `line` (number), `query` (string). Call `createRequest(filename, line, query)`. If `mcpConnected`, emit `server.notification({ method: "notifications/claude/channel", params: { content: query, meta: { request_id, filename, line: String(line) } } })`. Log `console.error("[channel] Request ${request_id} created, notification ${mcpConnected ? 'sent' : 'skipped (no MCP)'}")`. Return `Response.json({ request_id }, { status: 200 })`.
   - `GET /poll/:id` → extract `request_id` from pathname (`pathname.split("/")[2]`). Call `getStatus(request_id)`. If null, return 404 `{error: "Not found"}`. Otherwise return status object.
   - Default → return 404 `{error: "Not found"}`
   - Wrap the entire fetch in try/catch, log errors to stderr, return 500.

## Must-Haves

- [ ] `Server` uses low-level class with `experimental['claude/channel']` capability
- [ ] `instructions` string clearly tells Claude how to interpret events and call reply
- [ ] `reply` tool schema has required `request_id` and `text` parameters
- [ ] `POST /prompt` validates input and returns `{request_id}`
- [ ] `POST /prompt` emits `notifications/claude/channel` with correct content/meta shape
- [ ] `GET /poll/:id` returns pending/complete/404 correctly
- [ ] All logging uses `console.error` with `[channel]` prefix, never `console.log`
- [ ] HTTP binds to `127.0.0.1` on PORT env var (default 4321)

## Verification

- `cd channel && npx tsc --noEmit` — type-checks cleanly
- Start server and hit health endpoint: `cd channel && timeout 5 bun run server.ts 2>/dev/null & sleep 1 && curl -sf http://127.0.0.1:4321/health && kill %1` returns "ok"
  (Note: server will log MCP errors to stderr since there's no MCP host — that's expected. HTTP should still work.)

## Observability Impact

- Signals added: `[channel]` prefixed stderr logs for MCP connect, request creation, reply storage, errors
- How a future agent inspects: read stderr output of the running server process, hit `GET /health` for liveness, hit `GET /poll/:id` for per-request state
- Failure state exposed: HTTP 400 with error message for bad input, HTTP 404 for unknown request, stderr error lines for MCP failures

## Inputs

- `channel/store.ts` — request store API (createRequest, storeReply, getStatus, getRequestMeta)
- `channel/package.json` — dependencies available (@modelcontextprotocol/sdk)

## Expected Output

- `channel/server.ts` — Complete MCP channel server with HTTP endpoints and reply tool
