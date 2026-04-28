# Phase 16: canvas-reply-via-canvas-api - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 16-canvas-reply-via-canvas-api
**Areas discussed:** Node ID round-trip, Closed-canvas fallback, Markdown path unification, Failure surface

---

## Node ID round-trip

### Q1: How should the plugin identify the canvas node at `;;` trigger?

| Option | Description | Selected |
|--------|-------------|----------|
| Probe nodes Map (Recommended) | At trigger, iterate `view.canvas.nodes` to find the node whose embedded editor matches. Stores id in plugin state. No file artifacts. Loud failure if Obsidian renames the internal API. | ✓ |
| Active-view shortcut | `getActiveViewOfType('canvas').canvas.getSelectedNodes()` at trigger time. Simpler but trusts focus state. | |
| Claude picks the simplest one that works | Defer to research/planner. | |

**User's choice:** Probe nodes Map (Recommended)
**Notes:** First framing of the question conflated "which API for the write" (Canvas API, already locked) with "how do we identify which node at trigger time" (the actual gray area). Reframed the question with all three options on the Canvas API; user re-selected the probe approach.

### Q2: Where should the captured node ID live between trigger and reply?

| Option | Description | Selected |
|--------|-------------|----------|
| In activePollers entry (Recommended) | Extend `activePollers Map<pollerId, {intervalId, canvasNodeId?}>`. Same lifetime as pending request. | ✓ |
| Per-request map keyed by request_id | New parallel `Map<requestId, canvasNodeId>`. | |
| On lastQuery alongside filename/line | Singleton — overwritten by next `;;` trigger; concurrent canvas requests would clobber. | |

**User's choice:** In activePollers entry (Recommended)

### Q3: What if the trigger-time probe misses?

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to query-text matching (Recommended) | Capture no ID; reply path uses query-text matching with a warning log. | ✓ |
| Surface error immediately | Replace placeholder with error callout; don't even POST to channel. | |
| Send anyway, error on reply | POST as usual; show error callout when reply arrives if no ID. | |

**User's choice:** Fall back to query-text matching (Recommended)

---

## Closed-canvas fallback

### Q4: When no canvas leaf is open at reply time, what's the user-visible behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| JSON-patch silently (Recommended) | `vault.read` → parse → mutate → `vault.modify`. Silent success. Reply visible next time canvas opens. | ✓ |
| JSON-patch + Notice | Same plus a Notice toast. | |
| Defer until canvas opens | Hold reply in memory; write via Canvas API on canvas open. Lost on plugin reload. | |

**User's choice:** JSON-patch silently (Recommended)

### Q5: How is the node located in the JSON file?

| Option | Description | Selected |
|--------|-------------|----------|
| Match by node ID only (Recommended) | Find node where `node.id === capturedId`, replace text. | |
| ID first, query-text fallback | ID match first; if no ID was captured, scan text nodes for `> [!claude] {query}`. | ✓ |
| Stop on probe miss | If no ID captured, surface error callout instead of patching. | |

**User's choice:** ID first, query-text fallback
**Notes:** Belt-and-suspenders to cover the probe-miss case without diverging from D-03's policy.

---

## Markdown path unification

### Q6: Should the markdown reply path also adopt node-ID round-trip?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave markdown path untouched (Recommended) | Markdown stays on query-text matching. Canvas gets ID round-trip. Two code paths. | ✓ |
| Unify on node-ID round-trip | Both paths capture and match by ID. More code, more tests. | |
| Unify on a hybrid (ID-then-text) | Both paths capture ID when available, fall back to text. Doubles test matrix. | |

**User's choice:** Leave markdown path untouched (Recommended)

---

## Failure surface

### Q7: When Canvas API write fails (probe rejects or `setText`/`requestSave` throws), what does the user see?

| Option | Description | Selected |
|--------|-------------|----------|
| Error callout + console (Recommended) | Replace placeholder with error callout. `console.error` with exception. Loud but in-place. | |
| Error callout + Notice | Above plus a Notice toast. Loudest option. | ✓ |
| Silent fallback to JSON patch | Treat API failure same as closed-canvas. Hides the canary. | |
| Error callout + JSON patch attempt | Two-stage: try JSON patch as recovery, error callout only on total failure. | |

**User's choice:** Error callout + Notice
**Notes:** User went one notch louder than the recommended option. Aligns with STATE.md's "loud failure on internal-API rename" intent.

### Q8: How strict should the typed-narrow probe be?

| Option | Description | Selected |
|--------|-------------|----------|
| Check shape, log version (Recommended) | Probe four-field shape; log probe result on first canvas write per session. | ✓ |
| Bare-minimum check | Only check `setText` exists. | |
| Full optional-chaining throw-catch | No probe; just try/catch. Lets unrelated errors masquerade as API-rename. | |

**User's choice:** Check shape, log version (Recommended)

---

## Claude's Discretion

- Test strategy for the Canvas API path (vitest mocks of `view.canvas.nodes` + manual E2E).
- Exact file location for `writeCanvasReply` (new `src/canvas.ts` vs in `callout.ts` vs inline in `suggest.ts`).
- Multi-leaf disambiguation when the same canvas is open in multiple leaves — first-match-by-file-path with documented assumption.
- Whether `canvasNodeId` ever needs to cross the wire to the channel server (default: no, plugin-side only).

## Deferred Ideas

- Multi-leaf canvas disambiguation policy (deferred — first match by file path is fine until proven otherwise).
- Channel-server schema bump for `canvas_node_id` (deferred — plugin-side state suffices for P16).
- Markdown duplicate-query collision (deferred — D-06 leaves markdown matching unchanged).
- Atomic JSON-patch / mid-write canvas-open race (deferred — re-check leaf state immediately before write if a real race surfaces).
