---
phase: 16-canvas-reply-via-canvas-api
plan: 01
subsystem: testing
tags: [vitest, obsidian-mock, canvas, json-canvas, test-fixture]

# Dependency graph
requires:
  - phase: pre-existing
    provides: Existing src/__mocks__/obsidian.ts (Notice, TFile, App, Editor) and vitest config
provides:
  - Vault mock with atomic process(file, fn) read-modify-write
  - Vault.getFileByPath(path) returning TFile or null
  - Vault._seed / Vault._read test helpers
  - App.vault and App.workspace.getLeavesOfType() on the mock surface
  - Hand-built tab-indented JSON Canvas v1 fixture (3 text nodes, 2 share query)
  - canvas.test.ts skeleton with 23 it.todo placeholders covering D-01/D-03/D-04/D-05/D-07/D-08
  - Exported makeCanvasViewMock factory for re-use by Plan 02 / Plan 04
affects: [16-02, 16-03, 16-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Atomic Vault.process simulation (in-memory Map) — mirrors obsidian.d.ts:6531 contract
    - it.todo skeleton with named-todos that downstream plans must replace
    - Per-test makeCanvasViewMock factory (vi.fn for getData/setData/requestSave)

key-files:
  created:
    - src/__tests__/__fixtures__/sample.canvas.json.ts
    - src/__tests__/canvas.test.ts
  modified:
    - src/__mocks__/obsidian.ts

key-decisions:
  - "Vault.process is the atomic primitive — NOT vault.read + vault.modify (Anti-Pattern 1)"
  - "Mock node API exposes getData/setData per RESEARCH §D-08 Probe Correction (NOT setText)"
  - "Canvas/CanvasNode/CanvasView types stay as local interface stubs in src/canvas.ts (Plan 02), not in the obsidian mock — keeps mock file lean"
  - "JSON Canvas fixture is hand-built with tab indentation to match Obsidian's own writes"

patterns-established:
  - "Vault mock pattern: in-memory Map<path, {file, content}>, _seed/_read test helpers, atomic process()"
  - "Canvas leaf factory pattern: makeCanvasViewMock returns {view: {file, canvas: {nodes, requestSave}}}; tests override plugin.app.workspace.getLeavesOfType to return [leaf]"
  - "Skeleton test pattern: it.todo placeholders mirror RESEARCH §Test Map row-for-row; downstream plans replace each todo with a real assertion"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-04-29
---

# Phase 16 Plan 01: Wave 0 Test Infrastructure Summary

**Vault mock with atomic process(), JSON Canvas v1 fixture, and a 23-todo canvas.test.ts skeleton — Wave 0 mock surface ready for Plans 02-04 to consume.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-29T16:13:54Z
- **Completed:** 2026-04-29T16:15:38Z
- **Tasks:** 2 / 2
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments

- Extended `src/__mocks__/obsidian.ts` with a `Vault` class implementing the documented atomic `process(file, fn)` contract (mirrors obsidian.d.ts:6531). Added `getFileByPath`, plus test-only `_seed` / `_read` helpers.
- Extended `App` mock with `vault: Vault` and `workspace.getLeavesOfType()` so canvas-leaf probes are observable from tests.
- Added a hand-built tab-indented JSON Canvas v1 fixture with three text nodes — two share the query `"what is x"` (so D-05 distinct-replies tests can prove ID-first matching), one is non-claude prose (so type-guarding can be exercised).
- Created `src/__tests__/canvas.test.ts` with 23 `it.todo` placeholders covering every D-XX row in 16-RESEARCH.md §Phase Requirements → Test Map, plus a smoke test that asserts the `makeCanvasViewMock` factory builds a `Map<id, CanvasNode>` with `vi.fn()` `getData` / `setData` and a `vi.fn()` `requestSave`.
- Full suite green: 80 passing + 23 todo = 103 tests across 6 files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend src/__mocks__/obsidian.ts with Vault and getLeavesOfType** — `c828f54` (test)
2. **Task 2: Create JSON Canvas fixture + canvas.test.ts skeleton** — `0c4b4d1` (test)

**Plan metadata commit:** _(pending — added below as final commit)_

## Files Created/Modified

- `src/__mocks__/obsidian.ts` — **modified.** Added `Vault` class with atomic `process(file, fn)`, `getFileByPath(path)`, `_seed(path, content)`, `_read(path)`. Extended `App` with `vault: Vault = new Vault()` and `workspace.getLeavesOfType()` (default empty list, tests override). All existing exports (Notice, TFile, App, Editor, Component, MarkdownRenderChild, Plugin, Modal, PluginSettingTab, Setting, TextComponent, EditorSuggest, requestUrl) untouched.
- `src/__tests__/__fixtures__/sample.canvas.json.ts` — **created.** Tab-indented JSON Canvas v1 fixture export (`SAMPLE_CANVAS_JSON`). Three text nodes: `node-a` and `node-b` both pending `> [!claude] what is x` callouts; `node-c` is non-claude user prose.
- `src/__tests__/canvas.test.ts` — **created.** 6 describe blocks, 23 it.todo placeholders, 1 smoke test. Exports `makeCanvasViewMock(filePath, nodes)` for Plan 02 / Plan 04 re-use.

## Decisions Made

- **Vault mock uses an atomic `process(file, fn)`, not `vault.read` + `vault.modify`.** Rationale: 16-RESEARCH.md Anti-Pattern 1 — using read+modify in the production code would be racy (Obsidian save can land between read and modify and clobber the user). Mirroring the documented atomic primitive in the mock keeps the test contract honest.
- **Mock node API exposes `getData()` / `setData(data, addHistory?)`, not `setText()`.** Rationale: 16-RESEARCH.md §D-08 Probe Correction — `setText` does not exist on any community-typed Canvas surface (verified against advanced-canvas + enchanted-canvas type stubs). Using `setData` in the mock makes Plan 02 / Plan 04 tests fail loudly if production code regresses to the original CONTEXT.md guess.
- **No Canvas / CanvasNode / CanvasView classes added to the obsidian mock.** Per 16-PATTERNS.md: those types live as local interface stubs inside `src/canvas.ts` (Plan 02). Tests construct plain object literals via the `makeCanvasViewMock` factory matching the runtime shape. Keeps the mock file focused on real Obsidian exports.
- **`it.todo` skeleton instead of failing assertions.** Vitest treats `it.todo` as pending (not failure), so the suite stays green between Wave 0 and Wave 1. Downstream plans replace each todo with a real assertion before phase ships (enforced by Plan 02 / 04 acceptance criteria + the threat register's T-16-04 mitigation).
- **Named-todos for D-08 / D-05 / D-07 (per checker nit #7).** The skeleton explicitly names todos like `"probe rejects when canvas.nodes is not a Map"`, `"distinct replies for duplicate queries"`, `"json patch atomic write"`, `"loud failure on api exception"`, `"does NOT fall back on probe-failed"` — verifiable by `grep -E` so coverage of the high-priority decisions is contractual, not just count-based.

## Deviations from Plan

None — plan executed exactly as written.

The plan was authored against an existing-test count of "69+", but the live repo has grown to 79 baseline tests; this is consistent with the plan's wording (`exits 0 with the existing 69+ tests`) and required no adjustment.

## Issues Encountered

None.

## Downstream Owner Map (per `it.todo` placeholder)

Each downstream plan owns specific todos to replace with real assertions:

| Plan | Owns todos in describe block | Count |
|------|------------------------------|-------|
| 16-02 | `findCanvasNodeIdForEditor (D-01, D-03)` | 3 |
| 16-02 | `probeCanvasApi (D-08, corrected)` | 6 |
| 16-02 | `writeCanvasReply (D-05, D-07)` | 5 |
| 16-02 | `patchCanvasJson (D-04, D-05)` | 6 |
| 16-02 | `deliverCanvasReply (orchestration)` | 3 |
| 16-04 | (extends suggest.test.ts — does not own canvas.test.ts todos) | 0 |

Plan 16-03 (PollerEntry shape) does not own canvas.test.ts todos; it extends `suggest.test.ts` only.

## User Setup Required

None — pure test infrastructure, no external services.

## Next Phase Readiness

- ✅ Vault mock ready for `patchCanvasJson` round-trip tests in Plan 02
- ✅ `App.workspace.getLeavesOfType` overridable per test for `writeCanvasReply` and `deliverCanvasReply` tests in Plan 02
- ✅ `makeCanvasViewMock` factory exported and callable from Plan 02 / Plan 04 test files via `import { makeCanvasViewMock } from "./canvas.test"` (or relocate to a shared helpers file if Plan 02 prefers)
- ✅ Fixture importable as `import { SAMPLE_CANVAS_JSON } from "./__fixtures__/sample.canvas.json"`
- ✅ Suite stays green — 80 passing + 23 todo
- No blockers for Plans 02 / 03 / 04

## Self-Check: PASSED

Verified post-write:

- ✅ `src/__mocks__/obsidian.ts` — modified, present
- ✅ `src/__tests__/__fixtures__/sample.canvas.json.ts` — created, present
- ✅ `src/__tests__/canvas.test.ts` — created, present
- ✅ Commit `c828f54` — present in git log
- ✅ Commit `0c4b4d1` — present in git log
- ✅ All Task 1 grep acceptance criteria pass
- ✅ All Task 2 grep acceptance criteria pass
- ✅ `npx vitest run` — 80 passing, 23 todo, exit 0

---
*Phase: 16-canvas-reply-via-canvas-api*
*Completed: 2026-04-29*
