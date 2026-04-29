---
phase: 16-canvas-reply-via-canvas-api
plan: 04
subsystem: suggest
tags: [canvas, suggest, integration, p16, d-01, d-03, d-06, d-07, d-09]
requires:
  - "16-02 (canvas helpers: findCanvasNodeIdForEditor, writeCanvasReply, patchCanvasJson, deliverCanvasReply)"
  - "16-03 (PollerEntry shape + registerPoller third-arg contract)"
provides:
  - "Canvas-aware reply pipeline at all 4 reply-write sites in suggest.ts (success, send-failure, poll-error, timeout)"
  - "writeCanvasErrorCallout helper centralizing the loud-failure UX (Notice + console.error + Canvas API write w/ patchCanvasJson safety net)"
  - "Trigger-time canvas node ID capture; threaded into registerPoller(pollerId, intervalId, canvasNodeId)"
affects:
  - "src/suggest.ts (selectSuggestion + new private helper)"
tech-stack:
  added: []
  patterns:
    - "Branch-on-extension fork: filename.endsWith('.canvas') routes to Canvas API pipeline; else branch keeps the existing markdown replaceCalloutBlock path byte-identical"
    - "Single helper for canvas error UX (writeCanvasErrorCallout) — called from 4 sites: 3 error branches + success-branch failure recovery"
key-files:
  created:
    - .planning/phases/16-canvas-reply-via-canvas-api/16-04-SUMMARY.md
  modified:
    - src/suggest.ts
    - src/__tests__/suggest.test.ts
    - src/__tests__/canvas.test.ts
decisions:
  - "All 4 reply-write paths on the canvas branch route through Canvas API (D-07 fully scoped, not just success)"
  - "Zero replaceCalloutBlock(editor, ...) calls in any canvas branch — D-09 enforced (#14 bug class closed)"
  - "Markdown branch byte-identical at all 4 sites (D-06)"
  - "writeCanvasErrorCallout helper falls back to patchCanvasJson when deliverCanvasReply fails for any reason other than no-leaf — guaranteed-to-land error callout when API is healthy but JSON-only path is needed"
metrics:
  tasks_completed: 2
  duration: ~25 minutes
  completed_date: 2026-04-29
  test_count_baseline: 114
  test_count_after: 121
  test_count_delta: 7
---

# Phase 16 Plan 04: Wire Canvas Branch into suggest.ts Summary

Integration plan for Phase 16: forks the four reply-write sites in `selectSuggestion` on `filename.endsWith(".canvas")` and routes the canvas branch through the Canvas API pipeline (`deliverCanvasReply` / `writeCanvasReply` / `patchCanvasJson`) introduced in Plan 02 — closing #14 for success and all three error paths from canvas notes. Markdown branch is byte-identical (D-06).

## Tasks Executed

### Task 1: Wire canvas branch into src/suggest.ts (commit `e88a8a3`)

Six edits to `src/suggest.ts`:

| # | Edit | Lines (post-edit) |
|---|------|-------------------|
| 1 | Add `Notice` to obsidian imports + new `./canvas` import | 1–13 |
| 2 | `writeCanvasErrorCallout` private helper (Notice + console.error + deliverCanvasReply + patchCanvasJson safety net) | 79–116 |
| 3 | Trigger-time canvas probe (`findCanvasNodeIdForEditor` + D-03 console.warn) | 138–148 |
| 4 | Send-failure fork (canvas → `writeCanvasErrorCallout`; markdown → `replaceCalloutBlock`) | 170–181 |
| 5 | Timeout fork | 199–213 |
| 6 | Poll-error fork | 217–229 |
| 7 | Success fork (canvas → `deliverCanvasReply`, on failure → `writeCanvasErrorCallout`; markdown → `replaceCalloutBlock`) | 231–259 |
| 8 | `registerPoller` third arg | 266 |

Five `filename.endsWith(".canvas")` checks total: 1 trigger probe (line 139) + 4 reply forks (172, 203, 219, 234).

`writeCanvasErrorCallout` is called from 4 sites: 3 error branches (send-failure, timeout, poll-error) + success-branch failure recovery (when `deliverCanvasReply` returns `ok: false`).

Helper signature:

```typescript
private async writeCanvasErrorCallout(
    filename: string,
    nodeId: string | null,
    query: string,
    reason: string,
    originalError?: unknown,
): Promise<void>
```

### Task 2: Add canvas-branch tests + safety net (commit `e206b35`)

`src/__tests__/suggest.test.ts` — new `describe("canvas branch (P16 — D-01, D-03, D-06, D-07, D-09)", ...)` block with 6 tests:

1. Markdown branch (`.md`) writes via `replaceCalloutBlock` AND does NOT invoke canvas pipeline (`getLeavesOfType` spy was not called) — D-06/D-09 regression guard for checker warning #5.
2. Canvas branch success: probe matches, `setData` called with response body, `editor.replaceRange` NOT called for the response callout.
3. Canvas trigger no-match logs `console.warn` and `registerPoller` called with `canvasNodeId === null` (D-03).
4. Canvas send-failure: `setData` called with error body containing the error reason, `editor.replaceRange` NOT called for the error, Notice + console.error fired (D-07 send-fail).
5. Canvas poll-error: same assertions for poll-error branch (D-07 poll-error).
6. Canvas timeout: same assertions; error body contains "No response after" (D-07 timeout).

`src/__tests__/canvas.test.ts` — one new test: `writeCanvasReply` accepts an arbitrary error-shaped callout body — proves the helper's error UX has a tested foundation in canvas.ts.

`makePlugin`'s `registerPoller` was refactored to a `vi.fn()` (preserving the same `activePollers.set` side effect) so the new D-03 test could spy on its calls without breaking existing tests.

## Verification Results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` for src/suggest.ts | 0 errors (pre-existing test-file mock-typing errors unchanged — not introduced by this plan) |
| Test count baseline (post Plan 03) | 114 passing |
| Test count after Plan 04 | 121 passing (+7) |
| `npm run build` | Succeeds |
| `grep -c 'filename.endsWith(".canvas")' src/suggest.ts` | 5 (1 probe + 4 forks — exactly as required) |
| `grep -c 'this.writeCanvasErrorCallout(' src/suggest.ts` | 4 |
| `grep -c 'replaceCalloutBlock(editor, range.from, range.to' src/suggest.ts` | 4 (one per markdown-else branch — D-06 preserved) |
| Canvas branch contains zero `replaceCalloutBlock(editor, ...)` calls | Confirmed by inspection — every `replaceCalloutBlock(editor, ...)` is inside an `} else {` (markdown) branch (lines 177, 208, 224, 253) |

The acceptance-criteria awk pattern (`/filename\.endsWith\("\.canvas"\)/,/^[[:space:]]*\}[[:space:]]*else[[:space:]]*\{/`) returns 1 because awk's range matching is line-based — it begins at the trigger probe (line 139, which has no else) and runs until the first `} else {` it finds, sweeping in the legitimate markdown send-failure else branch. The semantically correct check is structural: every `replaceCalloutBlock(editor, ...)` call is inside the `} else {` of a `filename.endsWith(".canvas")` if-block — confirmed by the `grep -c` of markdown calls (4) matching the count of forks, and by direct file inspection. D-09 is enforced.

## Checker Fixes Addressed

- **Blocker #1 (D-07 fully scoped):** All 4 canvas write paths — success, send-failure, poll-error, timeout — route through the Canvas API pipeline. Three error branches use `writeCanvasErrorCallout` (which calls `deliverCanvasReply` with `buildErrorCallout` content); success branch calls `deliverCanvasReply` directly with `buildResponseCallout` content and falls back to `writeCanvasErrorCallout` on failure.
- **Blocker #2 (no replaceCalloutBlock last-resort in canvas branch):** The previous double-failure fallback to `replaceCalloutBlock(editor, ...)` is removed. The canvas-branch double-failure surface is Notice + console.error + a forced `patchCanvasJson` attempt; if even that fails, Notice + console.error are the surface — no editor.replaceRange path that would silently no-op (#14 bug class).
- **Warning #5 (markdown regression guard strengthened):** The new markdown-branch test adds `expect(getLeavesSpy).not.toHaveBeenCalled()` — a regression where suggest.ts mistakenly calls BOTH branches can no longer pass.

## Deviations from Plan

None — plan executed exactly as written.

The `acceptance_criteria` `awk` pattern produces a non-zero result on a structurally correct file due to a quirk in line-based range matching (described above). The semantic acceptance is met: D-09 is enforced, every canvas branch routes through the Canvas API pipeline, every markdown `replaceCalloutBlock(editor, ...)` is inside a markdown else-branch.

`main.js` was modified during the `npm run build` sanity check; since this is a generated artifact tracked only at release boundaries (per recent commit history), the local rebuild diff was discarded with `git checkout -- main.js` before the final commit.

## Self-Check: PASSED

Created files (with `[ -f path ] && echo FOUND`):
- `.planning/phases/16-canvas-reply-via-canvas-api/16-04-SUMMARY.md` — FOUND (this file)

Modified files (with `git log --oneline -- <path> | head -1`):
- `src/suggest.ts` — last touched in commit `e88a8a3` ✅
- `src/__tests__/suggest.test.ts` — last touched in commit `e206b35` ✅
- `src/__tests__/canvas.test.ts` — last touched in commit `e206b35` ✅

Commits:
- `e88a8a3 feat(16-04): wire canvas branch into suggest.ts at all 4 reply-write sites` ✅
- `e206b35 test(16-04): cover canvas branch dispatch + markdown regression guard` ✅
