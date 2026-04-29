# Roadmap

## M001: Inline Claude Chat MVP

- [x] **Phase 01: plugin-scaffold-editorsuggest-trigger** — Plugin scaffold + EditorSuggest trigger
- [x] **Phase 02: channel-server-with-reply-tool** — Channel server with reply tool
- [x] **Phase 03: end-to-end-wiring-error-handling** — End-to-end wiring + error handling

## M003: Repo Structure Fix

- [x] **Phase 04: move-files-git-init** — Move files + git init
- [x] **Phase 05: verify-vault-cleanup** — Verify + vault cleanup

## M004: Bug Fixes - Callout Matching, Error Messages, Settings Status

- [x] **Phase 06: request-id-callout-matching** — Request-ID callout matching
- [x] **Phase 07: bun-detection-settings-live-status** — Bun detection + settings live status

## M005: Long-Running Response Handling - Heartbeat + Elapsed Time + Auto-Retry

- [x] **Phase 08: live-elapsed-time-warning-in-callout** — Live Elapsed Time + Warning in Callout
- [x] **Phase 09: auto-retry-at-timeout-settings-update** — Auto-Retry at Timeout + Settings Update

## M006: DOM-Only Timer & Callout Redesign

- [x] **Phase 10: dom-only-timer-rendering-callout-redesign** — DOM-only timer rendering & callout redesign
- [x] **Phase 11: error-states-manual-retry-cleanup** — Error states, manual retry & cleanup

## M007: Post-Processor Removal & Code Cleanup

- [x] **Phase 12: strip-dead-code-simplify** — Strip dead code & simplify
- [x] **Phase 13: release** — Release

## M008: v0.2.0 — Install Hygiene & Channel Scoping

- [ ] **Phase 14: channel-instructions-consolidation** — Move channel rules into MCP `instructions` capability; one-shot migration to strip `@.obsidian/plugins/inline-claude/CLAUDE.md` include from existing vaults' root `CLAUDE.md` (#10)
- [ ] **Phase 15: install-hygiene-consent-and-removal** — Consent notice on first write, removal button that also kills orphan bun on configured port, document vault-touching writes (#12)
- [x] **Phase 16: canvas-reply-via-canvas-api** — Reply-back path for `.canvas` files via `view.canvas.nodes.get(id).setData()` + `canvas.requestSave()`, with JSON-patch fallback for closed leaves. Completed 2026-04-29; manual E2E 4/5 pass. #14 closed for open-leaf, background-leaf, and identical-query-text (D-05 ID-first). Closed-leaf-with-mid-flight reply remains a documented known gap (two-layer Obsidian-internal + replacePendingCalloutText silent-no-op root cause, two follow-ups recorded).

### Phase 16: canvas-reply-via-canvas-api

**Goal:** When a `;;` question is triggered from inside a `.canvas` text node, Claude's reply lands back inside that same node — using Obsidian's in-memory Canvas API as the primary write path so the reply survives Obsidian's own canvas saves.

**Why:** Today the reply path uses `editor.replaceRange` against the canvas node's embedded CodeMirror sub-editor. That silently no-ops once focus leaves the node, so canvas users see a callout placeholder that never updates (#14). Earlier proposals (#15 originally) wrote a JSON patch directly to the `.canvas` file, but that races Obsidian's own canvas save and can be silently clobbered. Routing through `view.canvas.nodes.get(id).setText()` + `canvas.requestSave()` keeps in-memory state and disk in sync; fragility shifts from silent data loss to a loud failure on Obsidian internal-API rename.

**Dependencies:** None. Independent of P14 (channel instructions) and P15 (install hygiene). Does not touch the markdown reply path.

**Scope:**
1. Branch on `filename.endsWith('.canvas')` in the reply path; route through a new `writeCanvasReply()` helper.
2. Try the Canvas API first behind a typed-narrow probe + try/catch (`workspace.getLeavesOfType('canvas')` → matching `view.canvas.nodes` Map → `node.setText()` → `canvas.requestSave()`).
3. Fall back to direct `.canvas` JSON patch only when no canvas leaf is open for that file (the only remaining failure mode once the in-memory race is eliminated).
4. Round-trip a stable canvas node ID captured at `;;` trigger time, so the reply matches by ID instead of fuzzy `> [!claude] {query}` text.
5. Markdown reply path stays untouched.

**Out of scope:** Multi-node canvas conversations, canvas-specific UI affordances, anything in P14/P15.

**Success criteria:**
- `;;` from a canvas text node round-trips to a `[!claude-done]` callout inside that same node, both when the canvas is the active leaf and when it's open in a background leaf.
- With the canvas leaf closed, the JSON-patch fallback writes the reply and Obsidian re-renders it on next open without losing user edits made in between.
- Replies match the originating callout by node ID, not by query text — proven by a test where two `;;` callouts with identical query text receive distinct replies correctly.
- Markdown notes still pass the existing reply-path test suite unchanged.
- Closes #14. References #15 as the chosen approach.

**Plans:** 5 plans

Plans:
- [x] 16-01-PLAN.md — Wave 0: Vault mock with atomic process(), App.workspace.getLeavesOfType, JSON Canvas fixture, and canvas.test.ts skeleton
- [x] 16-02-PLAN.md — src/canvas.ts module: probeCanvasApi, findCanvasNodeIdForEditor, writeCanvasReply, patchCanvasJson, deliverCanvasReply (uses setData not setText per RESEARCH; vault.process not vault.modify) — completed 2026-04-29 with 29 canvas tests, 0 it.todo, full D-08 corrected probe, DOM-containment fallback
- [x] 16-03-PLAN.md — Extend activePollers value shape to PollerEntry { intervalId, canvasNodeId } in src/main.ts (completed 2026-04-29; PollerEntry round-trip and onunload cleanup tested)
- [x] 16-04-PLAN.md — Wire canvas branch into src/suggest.ts (completed 2026-04-29; trigger probe + 4 reply-site forks routing through Canvas API; D-09 enforced — zero replaceCalloutBlock(editor, ...) on canvas branch; D-06 markdown branch byte-identical; +7 tests, suite at 121 passing)
- [x] 16-05-PLAN.md — Manual E2E checklist (5 scenarios in real Obsidian) — completed 2026-04-29; 4/5 pass (1, 2, 4, 5), Scenario 3 documented as known gap (closed-leaf-with-mid-flight reply, two-layer Obsidian-internal + replacePendingCalloutText silent-no-op root cause). Wave 4 also surfaced and fixed a file-change cancellation regression (eb61059).

## Backlog

### Phase 999.1: canvas-reply scenario 3 closed-leaf fallback fixes (BACKLOG)

**Goal:** Close the remaining sub-bullet of #14 — the closed-leaf-with-mid-flight reply path documented as a known gap in Phase 16. Two related fixes:

1. **Tactical (cheap, fully solves the silent-no-op layer):** Extend `replacePendingCalloutText` in `src/canvas.ts:93` with a trigger-text fallback (`;;${query}`) and a final append-on-new-line fallback. Convert silent no-ops in `writeCanvasReply` and `patchCanvasJson` to `{ok:false, reason:"no-pending-callout"}` and surface a Notice.

2. **Architectural (eliminates the Obsidian-internal crash):** Replace `editor.replaceRange` for canvas placeholder insertion with a Canvas-API write — e.g., `node.setData` with placeholder content at trigger time. Eliminates the `getFoldInfo` deferred-save crash that fires when the canvas leaf closes mid-flight. Larger refactor — needs a `writeCanvasPlaceholder` helper and careful ordering with suggestion-accept side effects.

**Context:** Phase 16 shipped at `83fddc5` with Scenario 3 as a documented known gap. Full forensics in `.planning/phases/16-canvas-reply-via-canvas-api/16-MANUAL-E2E.md` (Scenario 3 §Observed) and `16-05-SUMMARY.md`. Disk evidence on `inline-claude-brainstorm-canvas.canvas` shows nodes with `;;ping` (placeholder rolled back, patch silently no-op'd) and `[!claude] ping` without reply (placeholder persisted, patch missed).

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
