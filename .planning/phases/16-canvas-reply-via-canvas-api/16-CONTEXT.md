# Phase 16: canvas-reply-via-canvas-api - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

When `;;` is triggered from inside a `.canvas` text node, Claude's reply lands back inside that same node. Primary write goes through Obsidian's in-memory Canvas API (`workspace.getLeavesOfType('canvas')` → `view.canvas.nodes.get(id).setText()` → `canvas.requestSave()`). Direct JSON patch of the `.canvas` file is the fallback for the closed-leaf case. The markdown reply path is untouched — two code paths, one new helper.

Closes #14. Implements #15. Does not change #7/#8 work (already shipped). Does not touch P14 (channel instructions) or P15 (install hygiene).

</domain>

<decisions>
## Implementation Decisions

### Node ID round-trip
- **D-01:** At `;;` trigger time, when `filename.endsWith('.canvas')`, identify the canvas node by **probing `view.canvas.nodes`** — find the leaf matching the file via `workspace.getLeavesOfType('canvas')`, iterate `view.canvas.nodes.values()`, and match by editor instance (the suggest hook's `EditorSuggestContext.editor` should `===` the canvas node's embedded CodeMirror editor). Pure Canvas API. No file artifacts.
- **D-02:** The captured `canvasNodeId` lives on the `activePollers` map entry alongside `intervalId` (extend the value shape from `number` to `{ intervalId: number, canvasNodeId?: string }`). Same lifetime as the pending request — auto-cleaned when the poller cancels. No parallel data structure.
- **D-03:** If the trigger-time probe misses (no node in the Map matches the editor instance), capture no ID and fall back to query-text matching at reply time (same approach as the markdown path). Log a `console.warn` so the failure is visible without blocking the user.

### Closed-canvas fallback
- **D-04:** When no canvas leaf is open for the file at reply time, **JSON-patch the `.canvas` file silently** via `vault.read` → `JSON.parse` → mutate node text → `vault.modify`. No Notice — success is silent like the markdown path. User sees the reply the next time they open the canvas. The "Obsidian flushes its own save over our write" race only exists when a canvas leaf is open, so the patch is safe in this branch.
- **D-05:** Inside the JSON, locate the target node by **node ID first, query-text fallback**. If we have an ID from D-01, find `canvasJson.nodes` entry where `node.id === capturedId` and replace its `text` field. If the trigger-time probe missed (no ID captured per D-03), iterate text nodes scanning each `node.text` for `> [!claude] {query}` and replace in place. Belt-and-suspenders for the probe-miss case.

### Markdown path unification
- **D-06:** **Markdown reply path stays untouched.** Only the canvas path gets node-ID round-trip. Two code paths, branched by `filename.endsWith('.canvas')`. Matches ROADMAP.md scope ("Keeps markdown path untouched"). The duplicate-query edge case in markdown remains open but is low-impact; revisit if it ever surfaces in practice.

### Failure surface
- **D-07:** When the Canvas API write fails (typed-narrow probe rejects, `setText` throws, or `requestSave` throws), surface the failure **loudly**: replace the placeholder with an error callout *and* show a Notice toast (`"Inline Claude: Canvas API write failed. See console for details."`). `console.error` with the full exception. Matches STATE.md's "fragility shifts from silent data loss to loud failure on Obsidian internal-API rename."
- **D-08:** The typed-narrow probe checks four things: (a) `leaf.view.canvas` exists, (b) `.nodes` is a `Map`, (c) `.nodes.get(id)?.setText` is a function, (d) `.canvas.requestSave` is a function. If any check fails, treat it as an API-rename failure per D-07 — do NOT silently fall back to JSON patch (that would hide the canary). Log the probe result on the first canvas write per session for forensics.

### Branch point
- **D-09 (implied):** The `.canvas` branch lives in the reply-write step, not at trigger. The trigger path stays generic (insert callout, register poller). Only when `pollResult.status === "complete"` do we fork: if `filename.endsWith('.canvas')`, route through new `writeCanvasReply()`; otherwise use existing `replaceCalloutBlock`.

### Claude's Discretion
- Test strategy for the Canvas API path (vitest mock of `view.canvas.nodes` Map, plus manual E2E in a real canvas note). Researcher / planner will pick.
- Exact shape of `writeCanvasReply()` — whether it lives in `src/callout.ts`, `src/canvas.ts` (new file), or inline in `suggest.ts`. Planner decides.
- How `app.workspace.getActiveFile()?.path` interacts with split-leaf canvas views (ROADMAP.md doesn't call out multi-leaf disambiguation; planner can use first matching leaf and document the assumption).
- Whether to add the captured `canvasNodeId` to the channel server payload (would need a schema bump on `channel.js` and `channel-client.ts`) or keep it purely in plugin-side state. Plugin-side preferred unless researcher finds a reason.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and rationale
- `.planning/ROADMAP.md` §`### Phase 16: canvas-reply-via-canvas-api` — locked goal, scope, and success criteria. Source of truth for what the phase delivers.
- `.planning/STATE.md` §`### Planned: P16 — canvas reply path via Obsidian Canvas API (added 2026-04-28)` — architectural rationale for choosing Canvas API over JSON patch as primary, and the failure-mode tradeoff that informs D-07/D-08.

### Existing reply path
- `src/suggest.ts` — `selectSuggestion()` is the call site to fork. Builds the placeholder, fires the channel POST, registers the poller, and currently calls `replaceCalloutBlock` on `pollResult.status === "complete"`. The canvas branch lives at this last step.
- `src/callout.ts` — `findCalloutBlock` (query-text matching) and `replaceCalloutBlock`. The markdown helpers stay as-is per D-06; the new `writeCanvasReply()` is a sibling that takes a node ID and a response.
- `src/main.ts` — `activePollers: Map<string, number>` is the structure to extend per D-02. `registerPoller` / `cancelPoller` are the touch points.
- `src/channel-client.ts` — `sendPrompt` / `pollReply` types. Out of scope to modify unless researcher recommends adding `canvasNodeId` to the wire format (Claude's Discretion).
- `src/__tests__/suggest.test.ts:206` — existing canvas-related test (`falls back to getActiveFile() when context.file is null`). Pattern to follow for new probe / write tests.

### Channel server context
- `channel/server.ts` — read-only for P16. The reply tool delivers `{ request_id, text }`; no canvas-specific fields are needed plugin-side per D-02.

### External (no full path — researcher to verify)
- Obsidian Canvas API is internal/undocumented. Researcher should verify shape via the bundled `obsidian` typings (`node_modules/obsidian/obsidian.d.ts`) and any precedent in popular community plugins (Advanced Canvas, Canvas Mindmap). The four shape checks in D-08 are the contract.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`activePollers` Map** (`src/main.ts:15`) — already tracks per-request state with deterministic cleanup. Extending its value shape to `{ intervalId, canvasNodeId? }` keeps the new state on the existing lifecycle.
- **`buildResponseCallout` / `buildErrorCallout`** (`src/callout.ts:27, 42`) — produce the callout markdown string. The canvas write path uses the same string-building helpers; only the *delivery* differs (Canvas API `setText` vs `editor.replaceRange`).
- **`getActiveFile()?.path` fallback** (`src/suggest.ts:90`) — already handles the canvas-filename case at trigger. No changes needed there.

### Established Patterns
- Two-result types (`SendPromptResult`, `PollReplyResult`) — discriminated unions with `ok: true | false`. New `writeCanvasReply` should return the same shape so the caller can branch on success/failure for D-07's loud failure.
- Error callout in place of placeholder (`replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(...))`) is the existing failure UX — D-07 reuses this pattern but the placeholder may be inside a canvas node, not a markdown editor.
- `console.log` for happy-path lifecycle, `console.error` reserved for true failures. D-07 escalates Canvas-API failures to `console.error` per this convention.

### Integration Points
- Reply-write fork: `src/suggest.ts:163` (the `pollResult.status === "complete"` branch) is where `.canvas`-suffix routing kicks in.
- Probe call site: `src/suggest.ts:80–96` (top of `selectSuggestion`) is where the `.canvas` probe runs and the `canvasNodeId` is captured before `registerPoller`.
- New file likely: `src/canvas.ts` for `writeCanvasReply`, the typed-narrow probe, and `patchCanvasJson`. Keeps `suggest.ts` lean. Planner decides.

</code_context>

<specifics>
## Specific Ideas

- "Loud failure on Obsidian internal-API rename" — STATE.md verbatim. D-07 (error callout + Notice) and D-08 (strict probe, no silent fallback to JSON patch) implement this directly.
- Pure Canvas API both ends — the user explicitly asked "I thought we were using the canvas api?" mid-discussion. Confirmed: probe + write both go through `view.canvas.nodes`; JSON patch only when the leaf is closed.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-leaf canvas disambiguation** — if the same `.canvas` file is open in multiple leaves, which one wins? Not surfaced in scope; planner can use first-match-by-file-path. Add to backlog if it ever causes a real bug.
- **Channel-server schema bump for `canvas_node_id`** — keeping the ID plugin-side per D-02 means no wire-format change. If a future phase needs the ID server-side (e.g., richer canvas-aware reply rendering), revisit.
- **Markdown duplicate-query collision** — D-06 leaves this open. Markdown duplicate-query callouts collide on `findCalloutBlock`. Low impact in practice; revisit only if reported.
- **Atomic JSON-patch write / conflict with Obsidian opening the canvas mid-write** — D-04's "silent JSON patch" assumes vault.modify is atomic enough. If a real race surfaces, add a check via `getLeavesOfType('canvas')` immediately before write to upgrade to the Canvas API path.

</deferred>

---

*Phase: 16-canvas-reply-via-canvas-api*
*Context gathered: 2026-04-28*
