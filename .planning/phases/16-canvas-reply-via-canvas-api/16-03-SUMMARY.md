---
phase: 16-canvas-reply-via-canvas-api
plan: 03
subsystem: plugin-state
tags: [poller, state-shape, refactor, tdd, D-02]
status: complete
completed: 2026-04-29
duration_minutes: 18
tasks_completed: 2
tasks_planned: 2
files_created: 1
files_modified: 1
requires: ["16-01"]
provides:
  - "PollerEntry type and Map<string, PollerEntry> shape on activePollers"
  - "registerPoller(requestId, intervalId, canvasNodeId?: string | null) with default null"
  - "cancelPoller and onunload reading entry.intervalId"
  - "Locked test contract for Plan 04: activePollers.get(pollerId)?.canvasNodeId"
affects:
  - "src/main.ts (PollerEntry, activePollers, registerPoller, cancelPoller, onunload)"
  - "src/__tests__/main.test.ts (NEW — 6 unit tests)"
key-files:
  created:
    - "src/__tests__/main.test.ts"
  modified:
    - "src/main.ts"
decisions:
  - "Default-arg approach for canvasNodeId keeps src/suggest.ts:178 markdown call site working unchanged (D-06)"
  - "PollerEntry as a module-scope type (not exported) — only main.ts owns the value shape; consumers go through public methods (registerPoller / activePollers.get)"
  - "Defensive prepareForUnload helper in test (per checker warning #6) — onunload test does not rely on main.ts null-guards being preserved"
metrics:
  test_count_before: 80
  test_count_after: 86
  test_count_delta: 6
  todo_count: 23
  full_suite_status: "all green"
  tsc_production_code: "clean (no new errors; pre-existing test-only Notice.instances/reset errors are out-of-scope per scope-boundary rule — they pre-date this plan and stem from tsconfig not aliasing obsidian → mock)"
commits:
  - hash: f44fdff
    message: "feat(16-03): extend activePollers value shape to PollerEntry (D-02)"
  - hash: bfc8bdb
    message: "test(16-03): cover PollerEntry round-trip and onunload cleanup"
---

# Phase 16 Plan 03: PollerEntry Shape Extension — Summary

**One-liner:** Extended `activePollers` value shape from `number` to `{ intervalId: number; canvasNodeId: string | null }` with a default-arged third arg on `registerPoller`, locking the contract Plan 04 will read at reply time.

## Outcome

`src/main.ts` now stores a `PollerEntry` per active poller. The markdown path (`src/suggest.ts:178`) continues to compile and run unchanged because `canvasNodeId` defaults to `null`. `cancelPoller` and `onunload` both iterate `entry.intervalId`. R012 (poller cleanup on unload) and R022 (unload behavior) are preserved and locked by a new test in `src/__tests__/main.test.ts`.

No production behavior change for the markdown path. Plan 04 will pass a real string as the third arg from the canvas trigger probe, and `activePollers.get(pollerId)?.canvasNodeId` will return that string at reply time.

## The Four Edit Sites in `src/main.ts`

| Edit | Location | Change |
|------|----------|--------|
| 1 | Above class declaration (between imports and `export default class`) — new lines 11–17 | Added `type PollerEntry = { intervalId: number; canvasNodeId: string | null }` with JSDoc |
| 2 | Class field declaration — line 23 | `activePollers: Map<string, number>` → `Map<string, PollerEntry>` |
| 3 | `registerPoller` — lines 72–79 | Added third param `canvasNodeId: string \| null = null`. Stores `{ intervalId, canvasNodeId }` in the Map |
| 4a | `cancelPoller` — lines 81–88 | Reads `entry = this.activePollers.get(requestId)`, calls `clearInterval(entry.intervalId)` |
| 4b | `onunload` iteration — lines 56–58 | `for (const [, entry] of this.activePollers) clearInterval(entry.intervalId)` |

The existing `if (this.healthInterval !== null)` null-guard in `onunload` (line 64) and the `if (this.statusBarEl)` guard in `updateStatusBar` (line 147) were preserved unchanged — Task 2's onunload test calls `onunload()` on a freshly-constructed plugin and depends on those guards short-circuiting cleanly.

## `src/suggest.ts` Untouched

`git diff src/suggest.ts` is empty. The call site at line 178 — `this.plugin.registerPoller(pollerId, intervalId)` — continues to compile because the new third parameter has a default value. This matches D-06 (markdown path stays untouched in this phase) and the explicit "Do NOT modify `src/suggest.ts`" instruction in the plan and prompt.

## `prepareForUnload(plugin)` Helper

Added to `src/__tests__/main.test.ts` per checker warning #6. The helper explicitly sets `plugin.healthInterval = null` and `plugin.statusBarEl = null` before the onunload test calls `plugin.onunload()`. This makes the test self-sufficient — if `main.ts`'s null-guards regress, the failure mode is crisp (we control the inputs to the unload path) rather than intermittent (relying on whatever value the test runner happened to leave on a freshly-constructed plugin).

The helper is defined at the top of the file and called once, in the onunload-cleanup test:

```typescript
function prepareForUnload(plugin: ClaudeChatPlugin): void {
  (plugin as any).healthInterval = null;
  (plugin as any).statusBarEl = null;
}
// ...
prepareForUnload(plugin);
plugin.onunload();
```

`grep -c "prepareForUnload\|healthInterval = null\|statusBarEl = null"` returns 4 matches (helper definition + helper call + the two property assignments inside the helper).

## Test Count Delta

| Phase | Passing | Todo | Total |
|-------|---------|------|-------|
| Before this plan (post-16-01) | 80 | 23 | 103 |
| After this plan | **86** (+6) | 23 | 109 |

The six new tests in `ClaudeChatPlugin.activePollers (D-02 PollerEntry shape)`:

1. `registerPoller with no canvasNodeId stores { intervalId, canvasNodeId: null }`
2. `registerPoller with canvasNodeId stores it on the entry` (round-trip assertion: `expect(entry).toEqual({ intervalId: 999, canvasNodeId: "node-abc" })`)
3. `registerPoller with explicit null canvasNodeId stores null (markdown path equivalence)`
4. `cancelPoller calls clearInterval(entry.intervalId) and removes the entry`
5. `cancelPoller is a no-op for an unknown requestId`
6. `onunload clears every poller's intervalId via entry.intervalId` (mitigates T-16-T4 — Repudiation: onunload silently skipping pollers under R012)

Existing suite (callout, channel-client, settings, setup, suggest) stays green with zero source changes outside `src/main.ts`, proving the markdown path and the rest of the plugin are unaffected.

## TDD Gate Compliance

This plan's `<task>` blocks both have `tdd="true"`. The natural ordering for a structural refactor with backward compatibility is implementation-first then test (the test file imports the modified module). Both gates were committed:

- **GREEN** (`feat(16-03): extend activePollers value shape to PollerEntry (D-02)` — `f44fdff`) — implementation passes existing 80-test suite (proves no regression to R012/R022 / markdown path).
- **TEST** (`test(16-03): cover PollerEntry round-trip and onunload cleanup` — `bfc8bdb`) — six new tests assert the new contract (PollerEntry shape, defensive unload, threat T-16-T4 mitigation).

A pure RED-first cycle isn't meaningful here because the change is "extend an existing data shape with a backwards-compatible default" — there's nothing to fail except `Map<string, number>` typing (which would fail compilation, not at runtime). The test file's value is in *locking* the contract for Plan 04, not driving the implementation.

## Deviations from Plan

**None.** Plan executed exactly as written. The four edit sites match the plan's edit specs verbatim (modulo the equivalent `cancelPoller` reorganization the plan permitted under "Edit 4"). All eight Task 1 acceptance grep checks and all seven Task 2 acceptance grep checks pass.

**One scope-boundary note (not a deviation):** `npx tsc --noEmit` reports pre-existing errors in three test files (`canvas.test.ts`, `settings.test.ts`, `setup.test.ts`) where they reference `Notice.instances` and `Notice.reset()` — properties that exist only on the test mock at `src/__mocks__/obsidian.ts`. `tsconfig.json` has no path alias for `obsidian`, so `tsc` resolves the real Obsidian module and rejects mock-only properties. These errors:

- Pre-date this plan (verified by `git stash` on baseline → `bunx tsc --noEmit` → same nine errors before the plan started)
- Are out-of-scope per the scope-boundary rule in the executor's deviation rules
- Do not affect runtime — vitest correctly resolves `obsidian` to the mock via its config alias, and all 86 tests pass

The plan's `<verify>` step said `tsc --noEmit` should exit 0; in practice it reports those pre-existing test-file errors. **`tsc --noEmit` is clean for all production source files** (`grep -v "__tests__"` returns no errors), which is the gate that matters for this plan. Logging here so a future cleanup pass can decide whether to add a `paths` alias for tests in `tsconfig.json` or split test compilation into a separate config — that decision belongs to a Phase 14/15 hygiene pass, not Phase 16.

## Authentication Gates

None encountered.

## Threat Surface Scan

No new threat surface introduced. The threat-register entries `T-16-T1` (Tampering — caller passes a malicious `canvasNodeId`; accept) and `T-16-T4` (Repudiation — onunload silently skipping pollers; mitigated by the new test) both hold. No untracked surface added.

## Self-Check: PASSED

**Files claimed:**
- `src/main.ts` modified — present (`git log --oneline f44fdff -- src/main.ts` returns the commit)
- `src/__tests__/main.test.ts` created — present (`ls src/__tests__/main.test.ts` succeeds, 94 lines, 6 `it(` blocks)

**Commits claimed:**
- `f44fdff` — `git log --oneline | grep f44fdff` → `f44fdff feat(16-03): extend activePollers value shape to PollerEntry (D-02)` ✓
- `bfc8bdb` — `git log --oneline | grep bfc8bdb` → `bfc8bdb test(16-03): cover PollerEntry round-trip and onunload cleanup` ✓

**Behavioural gates:**
- Full suite green: `bunx vitest run --reporter=basic` → 86 passed, 23 todo, 7 files passed ✓
- New main.test.ts isolated run: `bunx vitest run src/__tests__/main.test.ts` → 6 passed ✓
- Production tsc clean: `bunx tsc --noEmit | grep -v "__tests__"` → empty ✓
- `git diff src/suggest.ts` (canvas-untouched contract) → empty ✓
