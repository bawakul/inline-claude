# Project State

## Project Reference

See: .planning/PROJECT.md

**Current focus:** Milestone v0.2.0 (defining requirements)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-28 — Canvas issues triaged: #7, #8 closed as fixed; #14 routed through #15; P16 (canvas-reply-via-canvas-api) added to M008

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

### Planned: P16 — canvas reply path via Obsidian Canvas API (added 2026-04-28)

Triaged the four canvas-related issues (#7, #8, #14, #15):

- **#7, #8 (filename empty on canvas trigger)** — already fixed in `src/suggest.ts:90` via `getActiveFile()?.path` fallback. Test coverage added `ac4606a`. Closed.
- **#14 (response never written back on canvas)** — real bug. The reply path uses `editor.replaceRange` against the canvas node's embedded CodeMirror sub-editor, which silently no-ops once focus leaves the node.
- **#15 (use Canvas API instead of JSON patch)** — accepted as the planned fix for #14.

**Why Canvas API over the JSON patch #14 originally proposed:** the JSON patch bypasses Obsidian's in-memory canvas model — if Obsidian flushes its own save *after* the plugin's write, the reply gets clobbered. The Canvas API path (`workspace.getLeavesOfType('canvas')` → `view.canvas.nodes` Map → `node.setText()` → `canvas.requestSave()`) goes through the host's model so in-memory state and file stay in sync. Fragility shifts from state (silent data loss) to internal-API surface (loud failure on Obsidian rename).

**P16 implementation plan:**
1. Branch on `filename.endsWith('.canvas')` in the reply path; route through new `writeCanvasReply()`.
2. Try Canvas API first with a typed-narrow probe + try/catch.
3. Fall back to direct JSON patch when canvas leaf is closed (only remaining failure mode after the in-memory race is removed).
4. Round-trip a canvas node ID at trigger time so the reply matches by ID instead of fuzzy `> [!claude] {query}` text.
5. Markdown reply path stays untouched.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-28
Stopped at: Canvas issues triaged; P16 added to ROADMAP. v0.2.0 requirements still pending — M008 has 3 phases scoped (P14, P15, P16).
Resume file: .planning/ROADMAP.md (M008 phases)
