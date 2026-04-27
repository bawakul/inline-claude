# Project State

## Project Reference

See: .planning/PROJECT.md

**Current focus:** Milestone v0.2.0 (defining requirements)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-27 — Port-conflict UX bug fixed (debug session mcp-port-conflict-ux)

## Accumulated Context

### Decisions

Migrated from GSD-2. Review PROJECT.md for key decisions.

v0.2.0 scope is driven by dogfooding friction in the `Bawa's Lab` vault:
- `@.obsidian/plugins/inline-claude/CLAUDE.md` import triggers the external-import security prompt when Claude Code runs from a subfolder of the vault
- Channel rules leak into every session under the vault, even those unrelated to the inline-claude channel
- MCP `instructions` capability is the correct channel-scoped location — loaded only when the MCP server is connected
- `.mcp.json` remains the only required vault write; consent + explicit removal close the UX gap

### Resolved: port-conflict UX bug (surfaced 2026-04-21, fixed 2026-04-27)

Symptom: plugin settings tab showed "🟢 Connected to Claude Code" and a plugin-launched terminal reported `--dangerously-load-development-channels server:inline-claude` loaded, but `;;` messages never reached that claude.

Root cause: `channel/server.ts` called `Bun.serve()` bare. When the port was already bound, the second bun exited *after* the MCP stdio handshake had succeeded — so Claude Code marked the server live, and the plugin's `/health` poll happily got 200 from the first (winning) bun. POSTs piped to whatever claude got there first.

Fix (debug session `.planning/debug/mcp-port-conflict-ux.md`):
- `channel/server.ts` — try/catch around `Bun.serve()` detecting EADDRINUSE; closes MCP stdio transport and exits 1 so Claude Code surfaces the failure and the plugin's health check goes red.
- `channel/server.ts` — `/health` now returns JSON `{ ok, session_id }` (UUID per process).
- `src/main.ts` — `checkHealth()` parses the new JSON, tracks `channelSessionId`, fires an Obsidian `Notice` if the session ID changes mid-run.
- `channel/__tests__/server.test.ts` — updated `/health` assertion + new `sessionId` test.
- Verification: `bun test` 28/28, `npm test` 77/77.

Outstanding hardening (not in this fix, deferred to backlog):
- `.mcp.json` could use a per-vault dynamic port (e.g. `${OBSIDIAN_VAULT_ID}`) or a unix socket to eliminate the collision class entirely.
- Plugin "Connected" status could verify the bound bun's parent PID matches a `server:inline-claude` claude, not just `/health` 200 + session_id.
- P15's removal UX should still kill orphan bun processes, not just edit `.mcp.json`.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-27
Stopped at: Port-conflict UX bug resolved; v0.2.0 requirements still pending
Resume file: .planning/debug/mcp-port-conflict-ux.md (resolved)
