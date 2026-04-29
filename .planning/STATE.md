---
gsd_state_version: 1.0
milestone: v0.2.0
milestone_name: — Install Hygiene & Channel Scoping
status: completed
stopped_at: Phase 16 Plan 05 complete (Wave 4 — manual E2E, 4/5 pass + 1 documented gap)
last_updated: "2026-04-29T19:30:00Z"
last_activity: "2026-04-29 — Phase 16 Plan 05 complete: manual E2E in real Obsidian. Scenarios 1, 2, 4, 5 pass; Scenario 3 (closed-leaf JSON-patch fallback) fails with documented two-layer root cause (Obsidian-internal getFoldInfo crash on canvas-leaf close + replacePendingCalloutText silent-no-op when on-disk text isn't the canonical placeholder). Wave 4 also surfaced and fixed a file-change cancellation regression (eb61059 — canvas pollers were being cancelled by the markdown-era file-change guard when the user navigated to a different leaf, before the reply could be delivered). Phase 16 ships with #14 closed for high-frequency paths (open-leaf, background-leaf, identical-query-text) and the closed-leaf-with-mid-flight reply path documented as a known gap with two follow-ups: (1) tactical replacePendingCalloutText robustness; (2) architectural Canvas-API placeholder write."
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Current focus:** Milestone v0.2.0 (Phase 16 complete; remaining: Phases 14, 15)

## Current Position

Phase: 16 — canvas-reply-via-canvas-api (complete with documented gap)
Plan: 05 (complete) — Phase 16 closed.
Status: All five plans complete. Manual E2E ran in real Obsidian; 4/5 scenarios pass. Scenario 3 (closed-leaf JSON-patch fallback) is a known gap with two follow-ups recorded.
Last activity: 2026-04-29 — Phase 16 Plan 05 complete: manual E2E 4/5 pass. Wave 4 also fixed a file-change cancellation regression (eb61059). #14 closed for high-frequency paths; closed-leaf-with-mid-flight remains open as a known gap.

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

Last session: --stopped-at
Stopped at: Phase 16 context gathered
Resume file: --resume-file

**Planned Phase:** 16 (canvas-reply-via-canvas-api) — 5 plans — 2026-04-29T06:34:04.056Z
