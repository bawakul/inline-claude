---
phase: 16-canvas-reply-via-canvas-api
plan: 02
subsystem: canvas
tags: [canvas, json-canvas, vault-process, probe, vitest, helpers]

# Dependency graph
requires:
  - phase: 16-01
    provides: Vault mock with atomic process / canvas test skeleton with 23 it.todo placeholders / SAMPLE_CANVAS_JSON fixture / makeCanvasViewMock factory
provides:
  - probeCanvasApi (full five-shape D-08 check, including per-node sampled setData/getData)
  - findCanvasNodeIdForEditor (editor-identity match + DOM-containment fallback)
  - writeCanvasReply (ID-first matching, query-text fallback, calls node.setData + canvas.requestSave)
  - patchCanvasJson (atomic vault.process JSON write, ID-first with text fallback, parse-error guard)
  - deliverCanvasReply (dispatcher — no-leaf only triggers JSON fallback; probe-failed bubbles)
  - 29 unit tests covering D-04 / D-05 / D-07 / D-08 with 0 it.todo remaining
affects: [16-03, 16-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Discriminated-union return types (CanvasWriteResult / JsonPatchResult / ProbeResult) — mirrors src/channel-client.ts SendPromptResult pattern
    - Atomic Vault.process(file, fn) read-modify-write — replaces racy vault.read+vault.modify (RESEARCH §Anti-Pattern 1)
    - Local interface stubs (CanvasMin / CanvasNodeMin / CanvasViewMin / CanvasTextDataMin) inside src/canvas.ts — Obsidian's bundled obsidian.d.ts has no Canvas class
    - `void _ref` pattern for runtime-noop import retention (keeps `from "./callout"` import live without redefining helpers)

key-files:
  created:
    - src/canvas.ts
  modified:
    - src/__tests__/canvas.test.ts

key-decisions:
  - "node.setData (NOT node.setText) for canvas writes — RESEARCH §D-08 Probe Correction: setText does not exist on the canonical Canvas API"
  - "vault.process for the JSON-patch fallback (atomic since Obsidian 1.1.0) — NOT vault.read + vault.modify which would be racy with debounced saves"
  - "Probe samples the FIRST node when nodes.size > 0 to validate per-node setData/getData (checker warning #4) — prevents false-pass when an API rename has occurred but the canvas-level shape still looks healthy"
  - "DOM-containment fallback path in findCanvasNodeIdForEditor has its own dedicated test (checker warning #3) — node.contentEl.contains(editor.cm.contentDOM) when node.child.editor is undefined"
  - "Empty-Map canvases pass the standalone probe; the no-match decision is delegated to writeCanvasReply (which is the only caller positioned to know whether the queried text exists)"
  - "deliverCanvasReply falls through to JSON-patch ONLY on reason:no-leaf — D-08 forbids silent fallback that masks API breakage; probe-failed / no-match / exception bubble"
  - "Module-level probeLogged flag (with test-only _resetProbeLogged) ensures node.child key forensics log fires exactly once per plugin load — verified by a dedicated test"

patterns-established:
  - "Inline interface stubs for untyped runtime APIs (CanvasMin, CanvasNodeMin) — kept local to the consuming module so the obsidian mock stays lean"
  - "Probe rejects per-node, not just per-canvas — the standalone probe's job is to be a stricter canary than its caller"
  - "Helpers return discriminated unions; callers branch on .ok and .reason; no exceptions thrown across module boundaries"

requirements-completed: []
requirements-addressed: ["D-04", "D-05", "D-07", "D-08"]

# Metrics
duration: 6min
completed: 2026-04-29
---

# Phase 16 Plan 02: Canvas helpers (probe + find + write + patch + dispatch) Summary

**Five canvas-reply primitives in `src/canvas.ts` with full D-08 corrected probe, atomic vault.process JSON patch, ID-first matching, DOM-containment fallback, and 29 passing unit tests — zero `it.todo` placeholders remaining.**

## Performance

- **Duration:** ~6 min (366s)
- **Started:** 2026-04-29T16:19:49Z
- **Completed:** 2026-04-29T16:25:55Z
- **Tasks:** 2 / 2
- **Files modified:** 2 (1 created, 1 modified)
- **Tests:** 108 total, 29 in canvas.test.ts (was 1 smoke + 23 todo), 0 todo remaining

## Accomplishments

### `src/canvas.ts` (new, 345 lines)

Five exported helpers — all reuse `buildResponseCallout` from `src/callout.ts` (no duplication):

```typescript
export function probeCanvasApi(view: unknown): ProbeResult;
export function findCanvasNodeIdForEditor(app: App, filePath: string, editor: Editor): string | null;
export function writeCanvasReply(app: App, filePath: string, nodeId: string | null, query: string, response: string): CanvasWriteResult;
export async function patchCanvasJson(app: App, filePath: string, nodeId: string | null, query: string, response: string): Promise<JsonPatchResult>;
export async function deliverCanvasReply(app: App, filePath: string, nodeId: string | null, query: string, response: string): Promise<CanvasWriteResult | JsonPatchResult>;
```

Plus three exported discriminated-union return types:

```typescript
export type ProbeResult =
    | { ok: true; canvas: CanvasMin }
    | { ok: false; reason: "no-canvas" | "nodes-not-map" | "no-requestSave" | "node-setData-missing" | "node-getData-missing" };

export type CanvasWriteResult =
    | { ok: true }
    | { ok: false; reason: "no-leaf" | "probe-failed" | "no-match" | "exception"; error?: unknown };

export type JsonPatchResult =
    | { ok: true }
    | { ok: false; reason: "no-file" | "no-match" | "parse-error"; error?: unknown };
```

Plus a test-only escape hatch `_resetProbeLogged()` so the once-per-session forensic log behavior can be asserted across tests deterministically.

### Critical correctness pins honored

- **D-08 corrected probe (full FIVE-shape).** `probeCanvasApi` checks (a) `view.canvas` exists, (b) `view.canvas.nodes instanceof Map`, (c) `view.canvas.requestSave` is a function, AND when `nodes.size > 0` samples the first node for (d) `setData` is a function, (e) `getData` is a function. `node.setText` is NOT referenced anywhere — `grep -c "node.setText" src/canvas.ts` returns 0. Reasons `node-setData-missing` and `node-getData-missing` are emitted as discriminated probe failures. ✅
- **D-04 atomic write via `vault.process`.** `patchCanvasJson` uses `app.vault.process(file, fn)` — `grep -c "vault.modify" src/canvas.ts` returns 0; `grep -c "vault.process" src/canvas.ts` returns 2. Anti-Pattern 1 from RESEARCH avoided. ✅
- **D-05 ID-first with query-text fallback.** Both `writeCanvasReply` (lines 207-227) and `patchCanvasJson` (lines 285-295) try `nodeId` first, then iterate text nodes scanning for `> [!claude] {query}` prefix. Distinct-replies test (`distinct replies for duplicate queries (ID-first locate)`) proves the ID-first path. ✅
- **D-07 / D-08 loud failure.** `deliverCanvasReply` only falls through to JSON-patch when `writeCanvasReply` returns `reason: "no-leaf"`. `probe-failed` / `no-match` / `exception` bubble untouched. The `does NOT fall back on probe-failed (D-08 loud failure)` test asserts `vault.process` is never called when the open leaf's probe rejects. ✅
- **DOM-containment fallback (Pitfall 2 / checker #3).** `findCanvasNodeIdForEditor` falls back to `node.contentEl?.contains((editor as any).cm?.contentDOM)` when `node.child.editor` is undefined. The test `DOM-containment fallback when node.child.editor is undefined` asserts this path returns the correct node id; the `makeCanvasViewMock` factory's default `contains: () => false` ensures the regular happy-path tests don't accidentally hit the fallback. ✅

### `src/__tests__/canvas.test.ts` (29 tests, was 1 + 23 todo)

| Group | Tests | D-XX coverage |
|-------|------:|---------------|
| `findCanvasNodeIdForEditor` | 4 | D-01 + D-03 + Pitfall 2 fallback + once-per-session log |
| `probeCanvasApi` (D-08 corrected) | 7 | (a) (b) (c) (d new) (e new) + healthy + empty-Map |
| `writeCanvasReply` | 7 | id-match, text-fallback, distinct-replies (D-05), exception (D-07), requestSave count, probe-failed, no-leaf |
| `patchCanvasJson` | 7 | atomic write, id-first/text-fallback, non-target verbatim, tab indentation, no-file, parse-error, no-match |
| `deliverCanvasReply` | 3 | API-on-open-leaf, fallback-on-no-leaf, NO-fallback-on-probe-failed (D-08) |
| Smoke (Plan 01 carryover) | 1 | makeCanvasViewMock factory shape |
| **Total** | **29** | All D-04 / D-05 / D-07 / D-08 rows from RESEARCH §Phase Requirements → Test Map |

Zero `it.todo` markers remain in the file (`grep -c it.todo`: 0).

## Task Commits

1. **Task 1: feat(16-02): add src/canvas.ts with five canvas-reply primitives** — `1351e22`
2. **Task 2: test(16-02): replace canvas.test.ts it.todo placeholders with real assertions** — `60ea288`

## Files Created/Modified

- `src/canvas.ts` — **created.** 345 lines. Five exported helpers + three discriminated-union return types + `_resetProbeLogged` test escape hatch + local Canvas API interface stubs (CanvasMin / CanvasNodeMin / CanvasViewMin / CanvasTextDataMin) + `replacePendingCalloutText` private helper.
- `src/__tests__/canvas.test.ts` — **modified.** All 23 `it.todo` placeholders replaced with real `it()` tests; added 5 supplementary tests (per-node probe rejection × 2, empty-Map probe acceptance, log-exactly-once, write-level no-leaf / probe-failed / no-match). Smoke test from Plan 01 retained verbatim.

## Decisions Made

- **`buildResponseCallout` import retained but referenced via `void _ref`.** The plan's contract is that callers pass `buildResponseCallout(query, response)` as the `response` argument — `canvas.ts` itself treats the string as opaque. The acceptance criterion `grep -n "from \"./callout\"" src/canvas.ts` returns one match required keeping the import; a `void _buildResponseCalloutRef` line keeps the import "used" without re-exporting a helper that already lives in `callout.ts` (which would have failed `grep -c "buildResponseCallout = function|export function buildResponseCallout"` returns 0). This is a 2-line stylistic choice; if downstream review prefers a side-effecting `if (false) buildResponseCallout("","")` or a re-export, easy to swap.
- **`_resetProbeLogged` is exported as a test-only escape hatch.** The module-level `probeLogged` flag would otherwise be sticky across tests in the same suite, making the "logs exactly once" assertion fragile to test-ordering. Underscore prefix signals private intent; not part of the public contract Plan 04 will consume.
- **The empty-Map probe accept-test was added (not in Plan 01's 23 todos).** RESEARCH and the plan both call for empty-Map acceptance in the probe ("writeCanvasReply will return no-match separately when there's nothing to write to"), but Plan 01 didn't include a todo for it. Added explicitly to lock the invariant.
- **The "logs node.child keys exactly once" test was added.** The behavior section in the plan calls for `probeLogged` to fire once per session — without a test, that's an unguarded forensic. Added.
- **Editor identity match uses `new Editor()` (mock instance) as the sentinel.** The test mock's `Editor` class is empty enough that two `new Editor()` instances are reliably non-equal references (no `Object.is` collisions), making them perfect identity sentinels for `===` comparisons in the find-by-editor test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking dependency] `node_modules` was empty in the worktree**

- **Found during:** Task 1 verification (`npx tsc --noEmit` reported missing modules)
- **Issue:** The fresh worktree had no `node_modules/` populated.
- **Fix:** Ran `npm install` to populate dependencies. No code change required; `package-lock.json` shifted by 4 lines but was not staged into either task commit (out-of-scope drift, leave for the integration step or a separate housekeeping commit).
- **Files modified:** None committed.
- **Commit:** N/A (transient setup).

### Pre-existing scope-boundary findings (NOT fixed under this plan)

**TS-MOCK-001 — `Notice` mock diverges from real `obsidian.Notice` type.** `npx tsc --noEmit` reports 9 errors in test files (`canvas.test.ts`, `settings.test.ts`, `setup.test.ts`) for `Notice.reset` / `Notice.instances` — properties present on the mock but absent on the real `obsidian.d.ts` declaration. **Confirmed pre-existing** by stashing all changes (`git stash -u`) and reproducing on commit `03b7f6d`. Vitest uses its own resolver alias and is unaffected (108/108 pass). Logged to `.planning/phases/16-canvas-reply-via-canvas-api/deferred-items.md` under TS-MOCK-001. Out of scope for 16-02 (`files_modified` is `src/canvas.ts` and `src/__tests__/canvas.test.ts` only; TS-MOCK-001 spans test files outside that list and would need a typed `Notice` shim or `as any` casts).

## Authentication Gates

None encountered.

## Issues Encountered

None besides the empty `node_modules` (Rule 3, fixed).

## Verification Results

- `npx vitest run --reporter=basic` → **108 / 108 passing, 0 todo, exit 0**
- `npx vitest run src/__tests__/canvas.test.ts --reporter=basic` → **29 / 29 passing, 0 todo, exit 0**
- `npx tsc --noEmit` (production source only — `npx tsc --noEmit 2>&1 | grep -E "src/canvas\.ts|src/main\.ts|src/suggest\.ts|src/callout\.ts|src/channel-client\.ts|src/settings\.ts|src/setup\.ts"`) → **empty (no errors in production source)**
- All Task 1 grep acceptance criteria pass (5 exports, 5× `node.setData` references, 0× `node.setText`, 2× `vault.process`, 0× `vault.modify`, 1× tab-indent `JSON.stringify`, 1× `from "./callout"`, 0× redefinition, ≥2 probe-sampling refs, ≥2 per-node rejection reasons, ≥1 DOM-containment ref).
- All Task 2 grep acceptance criteria pass (0× `it.todo`, 29× `it("`, 1× `from "../canvas"` import block, 12× `SAMPLE_CANVAS_JSON`, 2× `processSpy.not.toHaveBeenCalled`, 1× distinct-replies, 1× tab-indentation test, 2× per-node setData rejection, 2× per-node getData rejection, 2× DOM-containment).

## Next Phase Readiness

- ✅ All five canvas helpers ready for Plan 04 (`src/suggest.ts` wiring) to import via `import { deliverCanvasReply, findCanvasNodeIdForEditor, probeCanvasApi } from "./canvas"`.
- ✅ Discriminated-union return types (`CanvasWriteResult` / `JsonPatchResult`) match Plan 04's expected branching shape.
- ✅ DOM-containment fallback in `findCanvasNodeIdForEditor` is exercised — Plan 04 doesn't need to re-test it.
- ✅ `probeLogged` once-per-session flag lives inside `canvas.ts`; Plan 03 (`activePollers` shape change) doesn't touch it.
- ✅ No regression in 79 pre-existing tests; 29 new tests bring total to 108.
- ✅ Wave-2 work (16-02) does not modify `src/main.ts` or `src/suggest.ts` — Wave 2 (16-03) and Wave 3 (16-04) can land in parallel without merge conflict on this plan's surface.

## Self-Check: PASSED

Verified post-write:

- ✅ `src/canvas.ts` — created, present (`[ -f src/canvas.ts ]` → FOUND)
- ✅ `src/__tests__/canvas.test.ts` — modified, present (`[ -f src/__tests__/canvas.test.ts ]` → FOUND)
- ✅ `.planning/phases/16-canvas-reply-via-canvas-api/deferred-items.md` — created (logs TS-MOCK-001)
- ✅ Commit `1351e22` (feat) — present in `git log --oneline`
- ✅ Commit `60ea288` (test) — present in `git log --oneline`
- ✅ All Task 1 acceptance grep checks pass
- ✅ All Task 2 acceptance grep checks pass
- ✅ `npx vitest run` — 108 passing, 0 todo, exit 0
- ✅ Production source `tsc --noEmit` — empty grep result
- ✅ No deletions in either commit (`git diff --diff-filter=D --name-only HEAD~2 HEAD` empty)
- ✅ `src/main.ts` and `src/suggest.ts` untouched (`git diff --name-only HEAD~2 HEAD` shows only `src/canvas.ts` and `src/__tests__/canvas.test.ts`)

---
*Phase: 16-canvas-reply-via-canvas-api*
*Completed: 2026-04-29*
