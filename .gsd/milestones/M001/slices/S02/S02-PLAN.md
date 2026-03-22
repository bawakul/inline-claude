# S02: Channel server with reply tool

**Goal:** A standalone Bun channel server that bridges the Obsidian plugin to Claude Code via MCP — receiving HTTP POSTs, emitting `notifications/claude/channel` events, and exposing a `reply` tool that stores responses for polling.
**Demo:** `curl POST /prompt` returns a `request_id`. Claude Code (via `--dangerously-load-development-channels server:obsidian-chat`) receives the channel notification, calls the `reply` tool, and `curl GET /poll/:request_id` returns the response. Verified with curl, not the plugin.

## Must-Haves

- `channel/` subdirectory with its own `package.json`, `tsconfig.json`, Bun-native TypeScript
- Pure request store (`channel/store.ts`) with `createRequest`, `storeReply`, `getStatus`, and auto-expiry (5min TTL)
- `POST /prompt` endpoint accepts `{filename, line, query}`, creates a request, emits `notifications/claude/channel`, returns `{request_id}`
- `GET /poll/:request_id` endpoint returns `{status: "pending"}` or `{status: "complete", response: "..."}`
- MCP `Server` (low-level, not `McpServer`) with `experimental['claude/channel']` capability
- `reply` MCP tool registered via `ListToolsRequestSchema`/`CallToolRequestSchema` — accepts `{request_id, text}`, stores response
- `instructions` string in server constructor telling Claude Code how to interpret channel events and call `reply`
- `console.error()` only for logging — stdout reserved for MCP JSON-RPC
- HTTP bound to `127.0.0.1` on configurable port (default 4321, override via `PORT` env var)
- `.mcp.json` at project root for Claude Code discovery
- Unit tests for the store, integration tests for HTTP endpoints

## Proof Level

- This slice proves: contract (HTTP endpoints, MCP tool registration, store logic) + partial integration (HTTP ↔ MCP notification wiring)
- Real runtime required: yes (Bun server must start, HTTP endpoints must respond)
- Human/UAT required: no (full channel test with live Claude Code is S03 territory — here we verify HTTP contract and tool registration)

## Verification

- `cd channel && bun install && bun test` — all unit tests pass (store CRUD, TTL expiry, notification payload shape)
- `cd channel && bun test -- --grep "integration"` — HTTP integration tests pass (POST /prompt → 200 + request_id, GET /poll → pending, store reply → GET /poll → complete, GET /poll unknown id → 404, POST /prompt with bad body → 400)
- `test -f .mcp.json` — MCP registration file exists at project root
- `cd channel && bun run server.ts &; sleep 1; curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:4321/prompt -H 'Content-Type: application/json' -d '{"filename":"test.md","line":1,"query":"hello"}'` returns `200`
- `cd channel && bun test -- --grep "returns false|returns null|400|404|expiry"` — failure-path tests pass (unknown ID → null, double-reply → false, bad body → 400, unknown poll → 404, TTL expiry → null)

## Observability / Diagnostics

- Runtime signals: `console.error` structured log lines with `[channel]` prefix — server start, MCP connect, request created, reply stored, request expired
- Inspection surfaces: `GET /poll/:request_id` doubles as diagnostic — shows request status. `GET /health` (simple 200 OK) for liveness.
- Failure visibility: HTTP 400 with `{error: "..."}` for bad requests, HTTP 404 for unknown request_id, stderr log on MCP connection failure
- Redaction constraints: none (no secrets in store — just request_id, filename, line, query, response text)

## Integration Closure

- Upstream surfaces consumed: none (S02 is independent of S01)
- New wiring introduced: `channel/server.ts` as MCP server entry point, `.mcp.json` registration, `POST /prompt` and `GET /poll/:request_id` HTTP contract
- What remains before the milestone is truly usable end-to-end: S03 wires the Obsidian plugin's `selectSuggestion()` to POST to `/prompt` and polls `/poll/:request_id` to replace the placeholder callout

## Tasks

- [x] **T01: Scaffold channel project with request store and unit tests** `est:30m`
  - Why: Foundation layer — the pure request store is dependency-free and needed by both HTTP endpoints and the MCP reply tool. Setting up the channel subdirectory with its own package.json also establishes the build/test infrastructure.
  - Files: `channel/package.json`, `channel/tsconfig.json`, `channel/store.ts`, `channel/__tests__/store.test.ts`
  - Do: Create `channel/` subdirectory with Bun-compatible `package.json` (deps: `@modelcontextprotocol/sdk`; devDeps: `vitest`, `typescript`, `@types/bun`). Create `tsconfig.json` targeting ES2022 with Bun types. Implement `store.ts` with `createRequest(filename, line, query)` → `{request_id}`, `storeReply(request_id, text)` → boolean, `getStatus(request_id)` → `{status, response?, filename?, line?, query?} | null`. Use `Map` with 5-minute TTL via `setTimeout`. Write thorough unit tests for all store operations including TTL expiry (use `vi.useFakeTimers()`), unknown-id handling, and double-reply rejection.
  - Verify: `cd channel && bun install && bun test`
  - Done when: All store unit tests pass, `channel/package.json` is valid, `bun install` succeeds

- [x] **T02: Build MCP channel server with HTTP endpoints and reply tool** `est:45m`
  - Why: Core deliverable — the server file wires together MCP protocol handling (low-level `Server` class with `claude/channel` capability), HTTP endpoints (`POST /prompt`, `GET /poll/:id`, `GET /health`), and the `reply` tool handler. This is where R003, R005, and R006 converge.
  - Files: `channel/server.ts`
  - Do: Import `Server` from `@modelcontextprotocol/sdk/server/index.js` and `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`. Construct `Server` with `name: "obsidian-chat"`, `version: "0.1.0"`, `capabilities.experimental['claude/channel']: {}`, and `instructions` string. Register `ListToolsRequestSchema` handler returning `reply` tool schema (params: `request_id` string required, `text` string required). Register `CallToolRequestSchema` handler that calls `store.storeReply()` and returns `{content: [{type: 'text', text: 'Reply stored...'}]}`. Connect via `StdioServerTransport`. After MCP connect, start `Bun.serve()` on `127.0.0.1:${PORT}`. `POST /prompt` validates body, creates request in store, emits `server.notification('notifications/claude/channel', {params: {content, meta}})`, returns `{request_id}`. Use `connected` flag — if MCP isn't connected, still create request but log warning (allows HTTP-only testing). `GET /poll/:id` returns status from store. `GET /health` returns 200. All logging via `console.error` with `[channel]` prefix. Craft `instructions` string telling Claude: channel events contain user questions from Obsidian with file context, and Claude must call the `reply` tool with `request_id` and response text.
  - Verify: `cd channel && npx tsc --noEmit` (type-checks), `cd channel && bun run server.ts &; sleep 1; curl -s http://127.0.0.1:4321/health; kill %1` returns 200
  - Done when: `server.ts` type-checks, server starts and responds to `/health`

- [ ] **T03: Integration tests and MCP registration** `est:30m`
  - Why: Proves the HTTP contract works end-to-end (R003, R005 verification), validates the reply tool wiring (R006 verification), and registers the channel for Claude Code discovery.
  - Files: `channel/__tests__/server.test.ts`, `.mcp.json`
  - Do: Write integration tests that start `Bun.serve()` on a random port (import server setup as a function, or use `Bun.spawn` to start the server process). Test: POST /prompt with valid body → 200 + `{request_id}`, POST /prompt with empty body → 400, GET /poll with valid pending id → `{status: "pending"}`, programmatically call `store.storeReply()` then GET /poll → `{status: "complete", response: "..."}`, GET /poll with unknown id → 404, GET /health → 200. Create `.mcp.json` at project root: `{"mcpServers": {"obsidian-chat": {"command": "bun", "args": ["./channel/server.ts"]}}}`. Run full test suite. Update `.gitignore` if needed to track `channel/` properly.
  - Verify: `cd channel && bun test` — all tests pass; `test -f .mcp.json && cat .mcp.json | bun -e 'console.log(JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).mcpServers["obsidian-chat"] ? "ok" : "missing")'`
  - Done when: All unit + integration tests pass, `.mcp.json` exists and is valid, `curl` POST/GET cycle works against running server

## Files Likely Touched

- `channel/package.json`
- `channel/tsconfig.json`
- `channel/store.ts`
- `channel/server.ts`
- `channel/__tests__/store.test.ts`
- `channel/__tests__/server.test.ts`
- `.mcp.json`
