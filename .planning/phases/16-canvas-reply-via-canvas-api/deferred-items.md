# Phase 16 Deferred Items

Out-of-scope discoveries logged during execution; not fixed under any in-scope task.

## TS-MOCK-001 — `Notice` mock diverges from real `obsidian.Notice` type

**Discovered during:** 16-02 Task 1 (running `npx tsc --noEmit` for verification)

**Symptom:** `npx tsc --noEmit` reports 9 errors in test files for properties that exist on the `src/__mocks__/obsidian.ts` `Notice` class but not on the real `obsidian` declaration:

```
src/__tests__/canvas.test.ts(58,9): error TS2339: Property 'reset' does not exist on type 'typeof Notice'.
src/__tests__/settings.test.ts(22,9): error TS2339: Property 'reset' does not exist on type 'typeof Notice'.
src/__tests__/setup.test.ts(49,9): error TS2339: Property 'reset' does not exist on type 'typeof Notice'.
src/__tests__/setup.test.ts(140,28): error TS2339: Property 'instances' does not exist on type 'typeof Notice'.
src/__tests__/setup.test.ts(141,5): error TS7006: Parameter 'n' implicitly has an 'any' type.
src/__tests__/setup.test.ts(183,28): error TS2339: Property 'instances' does not exist on type 'typeof Notice'.
src/__tests__/setup.test.ts(184,5): error TS7006: Parameter 'n' implicitly has an 'any' type.
src/__tests__/setup.test.ts(187,29): error TS2339: Property 'instances' does not exist on type 'typeof Notice'.
src/__tests__/setup.test.ts(188,5): error TS7006: Parameter 'n' implicitly has an 'any' type.
```

**Why pre-existing:** Reproduced by stashing all uncommitted changes (`git stash -u`) — errors appear identically against commit `03b7f6d` (Plan 01). Vitest uses its own resolver alias to load `src/__mocks__/obsidian.ts`, so `Notice.reset` / `Notice.instances` work at runtime; only `tsc --noEmit` (which uses the real `obsidian.d.ts`) flags them.

**Why out of scope for 16-02:** None of these errors originate in production source files (`src/canvas.ts` itself compiles cleanly — `npx tsc --noEmit 2>&1 | grep src/canvas.ts` returns nothing). The plan's verification line says "tsc --noEmit exits 0" but the baseline was already non-zero before 16-02 began. Fixing it requires modifying test files outside this plan's `files_modified` list (`setup.test.ts`, `settings.test.ts`) AND changing the `Notice` mock to be cast through `as unknown as` — both unrelated to the canvas reply path.

**Recommended fix (future task):** Add `static reset(): void` and `static instances: Notice[]` to a typed test-only `Notice` shim, OR cast all `Notice.reset()` / `Notice.instances` accesses through `(Notice as any)` in test files.

**Verification path that DOES apply:** `npx vitest run` exits 0 — see `acceptance_criteria` clause "Existing tests still green: npx vitest run --reporter=basic exits 0". Vitest is the source of truth for "tests pass".
