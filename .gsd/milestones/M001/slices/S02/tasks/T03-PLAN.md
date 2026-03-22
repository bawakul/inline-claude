---
estimated_steps: 4
estimated_files: 3
skills_used:
  - test
---

# T03: Integration tests and MCP registration

**Slice:** S02 — Channel server with reply tool
**Milestone:** M001

## Description

Prove the HTTP contract works end-to-end with integration tests that exercise the real `Bun.serve()` handler, create the `.mcp.json` registration file at the project root so Claude Code can discover the channel, and add a vitest config for the channel subdirectory. This closes the verification loop for R003 (HTTP endpoint), R005 (MCP bridge — HTTP side), and R006 (reply tool — via programmatic store call simulating Claude's reply).

The integration tests don't need a live MCP connection. They test the HTTP layer independently: POST /prompt creates requests, GET /poll reads status, and programmatic `storeReply()` calls simulate what Claude's reply tool would do. This is sufficient for contract verification — the real MCP ↔ Claude Code integration is S03 territory.

## Steps

1. Create `channel/vitest.config.ts`:
   - Include `channel/__tests__/**/*.test.ts`
   - No special aliases needed (channel has no obsidian dependency)
2. Write `channel/__tests__/server.test.ts` integration tests:
   - Import the server's fetch handler or start the server on a random port. Preferred approach: refactor `channel/server.ts` to export a `createFetchHandler()` function (or similar) that returns the `fetch` function without starting MCP or binding to a port. If that's not feasible, use `Bun.spawn` to start the server as a subprocess on a random port.
   - **Test cases:**
     - `POST /prompt` with valid `{filename: "test.md", line: 5, query: "what is this?"}` → 200 + response body has `request_id` (string)
     - `POST /prompt` with missing fields → 400 + error message
     - `POST /prompt` with empty query → 400
     - `GET /poll/:request_id` immediately after POST → `{status: "pending"}`
     - Programmatically call `storeReply(request_id, "Hello!")` then `GET /poll/:request_id` → `{status: "complete", response: "Hello!"}`
     - `GET /poll/nonexistent-id` → 404
     - `GET /health` → 200 "ok"
     - `GET /unknown-route` → 404
   - Use `afterEach` to clean up (call `store.clearAll()` if needed, stop server)
3. Create `.mcp.json` at the project root (NOT in `channel/`):
   ```json
   {
     "mcpServers": {
       "obsidian-chat": {
         "command": "bun",
         "args": ["./channel/server.ts"]
       }
     }
   }
   ```
4. Run full test suite: `cd channel && bun test` — all unit + integration tests pass. Also verify `.mcp.json` is valid JSON with `obsidian-chat` server entry.

## Must-Haves

- [ ] Integration tests cover: valid POST, invalid POST, poll pending, poll after reply, poll unknown, health, unknown route
- [ ] All tests pass with `cd channel && bun test`
- [ ] `.mcp.json` exists at project root with correct `obsidian-chat` server entry
- [ ] `channel/vitest.config.ts` exists and properly configures test discovery

## Verification

- `cd channel && bun test` — all unit + integration tests pass
- `test -f .mcp.json && node -e "const f=require('fs').readFileSync('.mcp.json','utf8'); const j=JSON.parse(f); console.log(j.mcpServers['obsidian-chat'].command === 'bun' ? 'ok' : 'fail')"` prints "ok"

## Inputs

- `channel/server.ts` — the server implementation to test
- `channel/store.ts` — store API for programmatic reply simulation
- `channel/package.json` — vitest available as dev dependency

## Expected Output

- `channel/__tests__/server.test.ts` — integration tests for HTTP endpoints
- `channel/vitest.config.ts` — vitest configuration for channel project
- `.mcp.json` — MCP server registration at project root
