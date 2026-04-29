# Phase 16: canvas-reply-via-canvas-api - Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 5 (2 NEW, 3 MODIFY)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `src/canvas.ts` | NEW | utility / helper module | request-response + file-I/O | `src/callout.ts` (string-builder helpers) + `src/channel-client.ts` (discriminated-union returns) | role-match (composite) |
| `src/__tests__/canvas.test.ts` | NEW | test | unit | `src/__tests__/callout.test.ts` (helper unit tests) + `src/__tests__/suggest.test.ts` (mocked-host unit tests) | exact |
| `src/suggest.ts` | MODIFY | controller (EditorSuggest) | event-driven (trigger → poll → write fork) | self (existing `selectSuggestion`) | exact |
| `src/main.ts` | MODIFY | plugin entry / state container | lifecycle | self (existing `activePollers`, `registerPoller`, `cancelPoller`, `onunload`) | exact |
| `src/__mocks__/obsidian.ts` | MODIFY | test mock | shape-stub | self (existing `App`/`Editor`/`TFile` minimal stubs) | exact |

## Pattern Assignments

### `src/canvas.ts` (NEW — utility / helper module)

**Primary analog:** `src/callout.ts` — same role (a small helper module exporting pure functions used by `suggest.ts`'s reply step). Same module conventions: tab indentation, JSDoc on every export, `import type` for Obsidian types, no class — just exported functions.

**Secondary analog:** `src/channel-client.ts` — return-shape pattern (discriminated unions with `ok: true | false`). `writeCanvasReply` and `patchCanvasJson` mirror `SendPromptResult` / `PollReplyResult`.

#### Imports pattern (from `src/callout.ts:1` and `src/channel-client.ts:1`)

```typescript
// Type-only imports for Obsidian shape types (callout.ts:1)
import type { Editor, EditorPosition } from "obsidian";

// Value imports when calling host APIs (channel-client.ts:1)
import { requestUrl } from "obsidian";
```

For `src/canvas.ts`, the equivalent will be:
```typescript
import type { App, Editor, TFile } from "obsidian";
import type { CanvasNodeData, CanvasTextData } from "obsidian/canvas"; // data-only types
import { buildResponseCallout } from "./callout"; // reuse existing helper
```

#### Discriminated-union return shape (from `src/channel-client.ts:3-10`)

```typescript
export type SendPromptResult =
	| { ok: true; request_id: string }
	| { ok: false; error: string };

export type PollReplyResult =
	| { ok: true; status: "pending" }
	| { ok: true; status: "complete"; response: string }
	| { ok: false; error: string };
```

**Apply to `writeCanvasReply` and `patchCanvasJson`:** return `{ ok: true } | { ok: false; reason: ...; error?: unknown }` so callers in `suggest.ts` can branch on `.ok` and route to the loud-failure UX (D-07) when `ok === false`.

#### Try/catch + structured-error pattern (from `src/channel-client.ts:20-46`)

```typescript
try {
    const res = await requestUrl({ /* ... */ throw: false });
    if (res.status === 200) {
        const data = res.json;
        return { ok: true, request_id: data.request_id };
    }
    let errorMsg: string;
    try {
        errorMsg = res.json?.error ?? res.text ?? `HTTP ${res.status}`;
    } catch {
        errorMsg = `HTTP ${res.status}`;
    }
    return { ok: false, error: errorMsg };
} catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
}
```

**Apply to `writeCanvasReply`:** wrap the `setData` + `requestSave` calls in the same outer try/catch, returning `{ ok: false, reason: "exception", error }` on throw. Per D-07, the caller is responsible for the Notice + error-callout UX — this helper just returns the structured result.

#### JSDoc and pure-function pattern (from `src/callout.ts:23-37`)

```typescript
/**
 * Build a response callout with the original query and Claude's response.
 * The `+` makes it collapsible in Obsidian.
 */
export function buildResponseCallout(query: string, response: string): string {
    // ...
}
```

**Apply to all four canvas helpers:** every export gets a JSDoc block describing what / when / why. Tab indentation. No default exports.

#### String-replacement reuse (from `src/callout.ts:131-143`)

```typescript
export function replaceCalloutBlock(
    editor: Editor,
    from: number,
    to: number,
    newContent: string
): void {
    const fromPos: EditorPosition = { line: from, ch: 0 };
    const toPos: EditorPosition = {
        line: to,
        ch: editor.getLine(to).length,
    };
    editor.replaceRange(newContent, fromPos, toPos);
}
```

**For canvas helpers:** the *callout-string content* is built by reusing `buildResponseCallout(query, response)` and `buildErrorCallout(query, errorMsg)` from `callout.ts` (do NOT duplicate). Only the *delivery* differs — `node.setData({ ...current, text: newText })` instead of `editor.replaceRange`.

#### Console-logging convention (from `src/main.ts` and `src/suggest.ts`)

- `console.log(...)` for happy-path lifecycle: `src/main.ts:43`, `src/suggest.ts:111,124,132,141,154,164`
- `console.warn(...)` for soft failures (none yet — P16 introduces this for D-03 probe-miss)
- `console.error(...)` reserved for true failures (none yet — P16 introduces this for D-07)

**Apply:**
- `findCanvasNodeIdForEditor` returning `null` → caller logs `console.warn` (D-03)
- Probe failure / `setData` throw / `requestSave` throw → caller logs `console.error` (D-07)
- First canvas write per session → log probe result for forensics (D-08)

---

### `src/suggest.ts` (MODIFY — fork at trigger and at reply)

**Analog:** self. The existing `selectSuggestion` (lines 76-180) is the call site to fork. Two additive changes only — no restructure.

#### Trigger-time probe insertion point (after `src/suggest.ts:91`)

Existing code:
```typescript
const filename = file
    ? file.path
    : this.plugin.app.workspace.getActiveFile()?.path ?? "";
const nearLine = start.line;

// Insert single-line callout + blank line for cursor
editor.replaceRange(buildCalloutHeader(value) + "\n\n", start, end);
```

**Insert after `nearLine`, before `replaceRange`:**
```typescript
let canvasNodeId: string | null = null;
if (filename.endsWith(".canvas")) {
    canvasNodeId = findCanvasNodeIdForEditor(this.plugin.app, filename, editor);
    if (canvasNodeId === null) {
        console.warn(
            `Inline Claude: canvas trigger in ${filename} but no node matched ctx.editor. ` +
            `Falling back to query-text matching at reply time.`,
        );
    }
}
```

The `canvasNodeId` is then threaded through to the `registerPoller` call (line 178).

#### Reply-time fork insertion point (existing `src/suggest.ts:163-171`)

Existing code:
```typescript
if (pollResult.status === "complete") {
    console.log(`Poll complete for ${pollerId}`);
    const range = findCalloutBlock(editor, value, nearLine);
    if (range) {
        replaceCalloutBlock(editor, range.from, range.to, buildResponseCallout(value, pollResult.response));
    }
    this.plugin.cancelPoller(pollerId);
    return;
}
```

**Replace with branched dispatch (D-09):**
```typescript
if (pollResult.status === "complete") {
    console.log(`Poll complete for ${pollerId}`);

    if (filename.endsWith(".canvas")) {
        const entry = this.plugin.activePollers.get(pollerId);
        const nodeId = entry?.canvasNodeId ?? null;
        const result = await deliverCanvasReply(
            this.plugin.app, filename, nodeId, value, pollResult.response,
        );
        if (!result.ok) {
            // D-07 loud failure
            console.error(`Canvas reply failed: ${result.reason}`, result.error);
            new Notice("Inline Claude: Canvas API write failed. See console for details.");
            const range = findCalloutBlock(editor, value, nearLine);
            if (range) {
                replaceCalloutBlock(editor, range.from, range.to,
                    buildErrorCallout(value, `Canvas write failed: ${result.reason}`));
            }
        }
    } else {
        // existing markdown path — UNCHANGED per D-06
        const range = findCalloutBlock(editor, value, nearLine);
        if (range) {
            replaceCalloutBlock(editor, range.from, range.to, buildResponseCallout(value, pollResult.response));
        }
    }
    this.plugin.cancelPoller(pollerId);
    return;
}
```

#### Existing failure-UX pattern to mirror (from `src/suggest.ts:114-121`, `139-149`, `153-161`)

```typescript
if (!sendResult.ok) {
    console.log(`Send failed: ${sendResult.error}`);
    const range = findCalloutBlock(editor, value, nearLine);
    if (range) {
        replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, sendResult.error));
    }
    return;
}
```

**Reuse for canvas-write loud failure:** the same `findCalloutBlock` → `replaceCalloutBlock(buildErrorCallout(...))` triplet is the documented failure UX. P16 only ADDS `new Notice(...)` and `console.error(...)` per D-07 — the editor-side error-callout write is unchanged.

> **Note for canvas case:** when the canvas leaf is open, `editor` here is the EmbeddedEditor inside the canvas node. The error-callout `replaceCalloutBlock` may itself silently no-op (the same #14 bug). Planner should consider routing the error UX through `writeCanvasReply` (write `buildErrorCallout` instead of `buildResponseCallout` text) for consistency. Document the decision in PLAN.md.

---

### `src/main.ts` (MODIFY — extend `activePollers` value type)

**Analog:** self. The existing `activePollers: Map<string, number>` at line 15, `registerPoller` at lines 64-67, `cancelPoller` at 69-76, and `onunload` iteration at 47-51 are the four touch points.

#### Existing structure (`src/main.ts:15`)

```typescript
activePollers: Map<string, number> = new Map();
```

#### Existing register / cancel / cleanup (`src/main.ts:64-76`, `47-51`)

```typescript
registerPoller(requestId: string, intervalId: number): void {
    this.activePollers.set(requestId, intervalId);
    console.log(`Polling started for ${requestId}`);
}

cancelPoller(requestId: string): void {
    const intervalId = this.activePollers.get(requestId);
    if (intervalId !== undefined) {
        clearInterval(intervalId);
        this.activePollers.delete(requestId);
        console.log(`Polling cancelled for ${requestId}`);
    }
}

// onunload (lines 47-51):
const count = this.activePollers.size;
for (const [, intervalId] of this.activePollers) {
    clearInterval(intervalId);
}
this.activePollers.clear();
```

#### Pattern to apply (D-02)

Extend value shape to `{ intervalId: number; canvasNodeId: string | null }`. Per RESEARCH.md Example B:

```typescript
type PollerEntry = { intervalId: number; canvasNodeId: string | null };

activePollers: Map<string, PollerEntry> = new Map();

registerPoller(requestId: string, intervalId: number, canvasNodeId: string | null = null): void {
    this.activePollers.set(requestId, { intervalId, canvasNodeId });
    console.log(`Polling started for ${requestId}`);
}

cancelPoller(requestId: string): void {
    const entry = this.activePollers.get(requestId);
    if (entry !== undefined) {
        clearInterval(entry.intervalId);
        this.activePollers.delete(requestId);
        console.log(`Polling cancelled for ${requestId}`);
    }
}

// onunload — iterate entry.intervalId, not the value directly:
for (const [, entry] of this.activePollers) {
    clearInterval(entry.intervalId);
}
```

**Default-arg note:** `canvasNodeId: string | null = null` keeps the existing markdown-path call sites at `src/suggest.ts:178` working without change (per D-06: markdown path untouched). Only the canvas branch passes a non-null third arg.

---

### `src/__tests__/canvas.test.ts` (NEW — unit tests)

**Primary analog:** `src/__tests__/callout.test.ts` — same shape (helper-module unit tests, no network, simple `vi.fn()` mocks for editor methods, JSDoc-free `it(...)` blocks with descriptive names).

**Secondary analog:** `src/__tests__/suggest.test.ts:206` (the existing canvas-aware test) — same `makePlugin` + `makeEditorWithLines` factories, same `vi.hoisted` + `vi.mock` pattern for the obsidian module, same `vi.useFakeTimers()` setup.

#### Imports + hoisted-mock pattern (from `src/__tests__/channel-client.test.ts:1-16`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendPrompt, pollReply } from "../channel-client";

const { mockRequestUrl } = vi.hoisted(() => ({
    mockRequestUrl: vi.fn(),
}));

vi.mock("obsidian", async (importOriginal) => {
    const original = await importOriginal<typeof import("obsidian")>();
    return {
        ...original,
        requestUrl: mockRequestUrl,
    };
});

beforeEach(() => {
    mockRequestUrl.mockReset();
});
```

**Apply to canvas tests:** if the test module needs to override an obsidian export (unlikely for canvas — most overrides go on the `App` instance directly), use the same `vi.hoisted` + `vi.mock("obsidian", async (importOriginal) => ...)` shape. Importantly, this preserves `App`/`TFile`/`Editor`/`Notice` from the mock module while overriding only the specific function.

#### Plugin / editor factory (from `src/__tests__/suggest.test.ts:72-134`)

```typescript
function makePlugin(overrides?: { /* ... */ }) {
    const app = new App();
    if (overrides?.activeFilePath !== undefined) {
        // ... attach getActiveFile override
    }
    return {
        app,
        settings: { /* ... */ },
        activePollers: new Map<string, number>(),
        registerPoller(requestId: string, intervalId: number) { /* ... */ },
        cancelPoller(requestId: string) { /* ... */ },
        registerInterval(id: number) { return id; },
    };
}

function makeEditorWithLines(lines: string[]) {
    const data = [...lines];
    return {
        getLine: (n: number) => data[n] ?? "",
        lineCount: () => data.length,
        replaceRange: vi.fn((text, from, to) => { /* mutate `data` in-place */ }),
        // ...
    } as any;
}
```

**Apply to canvas tests:** add a sibling `makeCanvasViewMock` factory (sketch already in RESEARCH.md `## Wave 0 Gaps`). It builds a `view.canvas.nodes` Map of node objects with `vi.fn()` for `getData`/`setData`/`requestSave`. Then patch `plugin.app.workspace.getLeavesOfType = vi.fn(() => [{ view: <mock view> }])`.

#### Existing canvas-aware test as call-site template (`src/__tests__/suggest.test.ts:206-225`)

```typescript
it("falls back to getActiveFile() when context.file is null (canvas case — #7, #8)", async () => {
    mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
    mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

    const plugin = makePlugin({ activeFilePath: "My Canvas.canvas" });
    const editor = makeEditorWithLines([";;hello"]);

    callSelectSuggestion(plugin, editor, "hello", null);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockSendPrompt).toHaveBeenCalledOnce();
    expect(mockSendPrompt).toHaveBeenCalledWith(4321, {
        filename: "My Canvas.canvas",
        line: 0,
        query: "hello",
    });
});
```

**Apply to new canvas tests:** Same `await vi.advanceTimersByTimeAsync(0)` to flush the async IIFE; same `await vi.advanceTimersByTimeAsync(1000)` to advance one poll tick. Test names from RESEARCH.md "Phase Requirements → Test Map" table (D-01, D-03, D-04, D-05 ID-first / text-fallback / distinct-queries, D-07, D-08 parametrized).

#### Pure-helper test pattern (from `src/__tests__/callout.test.ts:13-52`)

```typescript
describe("buildCalloutHeader", () => {
    it("formats query as the callout title", () => {
        expect(buildCalloutHeader("hello")).toBe("> [!claude] hello");
    });
    // ...
});

describe("insertCallout", () => {
    it("calls editor.replaceRange with callout header", () => {
        const replaceRange = vi.fn();
        const editor = { replaceRange } as any;
        insertCallout(editor, { line: 0, ch: 0 }, { line: 0, ch: 7 }, "hello");
        expect(replaceRange).toHaveBeenCalledWith("> [!claude] hello", { line: 0, ch: 0 }, { line: 0, ch: 7 });
    });
});
```

**Apply:** unit-test `findCanvasNodeIdForEditor`, `writeCanvasReply`, `patchCanvasJson` directly with hand-built `App` mocks — same minimal `vi.fn()`-on-a-shape pattern. No need to drive everything through `ClaudeSuggest.selectSuggestion` (that's covered by extensions to `suggest.test.ts`).

---

### `src/__mocks__/obsidian.ts` (MODIFY — add Vault, getLeavesOfType, canvas types)

**Analog:** self. The file already follows a "minimum shape to compile + drive tests" convention (see `App`/`Editor`/`TFile`/`Notice` at lines 31-77, 79-91, 219-224, 31-43).

#### Existing minimal-shape pattern (`src/__mocks__/obsidian.ts:66-77`)

```typescript
export class App {
    workspace = {
        getActiveFile: (): TFile | null => {
            const f = new TFile();
            f.path = "test.md";
            return f;
        },
        activeEditor: {
            editor: new Editor(),
        } as any,
    };
}
```

#### Existing TFile minimal shape (`src/__mocks__/obsidian.ts:219-224`)

```typescript
export class TFile {
    path: string = "";
    basename: string = "";
    extension: string = "md";
    name: string = "";
}
```

#### Existing Notice — already used for D-07 (`src/__mocks__/obsidian.ts:31-43`)

```typescript
export class Notice {
    message: string;
    timeout?: number;
    static instances: Notice[] = [];
    constructor(message: string, timeout?: number) {
        this.message = message;
        this.timeout = timeout;
        Notice.instances.push(this);
    }
    static reset(): void {
        Notice.instances = [];
    }
}
```

**Apply for D-07 testing:** tests assert `Notice.instances.length === 1` and `Notice.instances[0].message` matches the expected string. `Notice.reset()` in `beforeEach`.

#### Patterns to add (P16 specific)

Per RESEARCH.md `## Wave 0 Gaps`:

1. **Extend `App.workspace`** with `getLeavesOfType(type: string): WorkspaceLeaf[]`. Default returns `[]`; tests override per scenario:
   ```typescript
   workspace = {
       getActiveFile: (): TFile | null => { /* existing */ },
       activeEditor: { editor: new Editor() } as any,
       getLeavesOfType: (_type: string): any[] => [],  // tests override
   };
   ```

2. **Add `Vault` class** with `process(file, fn)` (atomic read-modify-write — see RESEARCH.md Pattern 4) and `getFileByPath(path)`:
   ```typescript
   export class Vault {
       private files: Map<string, string> = new Map();
       getFileByPath(path: string): TFile | null { /* ... */ }
       async process(file: TFile, fn: (data: string) => string): Promise<string> {
           const data = this.files.get(file.path) ?? "";
           const next = fn(data);
           this.files.set(file.path, next);
           return next;
       }
       // test helper
       _seed(path: string, content: string): TFile { /* ... */ }
   }
   ```
   Then attach to `App`: `vault: Vault = new Vault();`

3. **NO need to add Canvas/CanvasNode/CanvasView classes to the mocks** — those types are written inline in `src/canvas.ts` as local interface stubs (per RESEARCH.md Pattern 1), and tests construct plain object literals matching that shape (see RESEARCH.md `makeCanvasViewMock` sketch at line 663-683). Keeps the mock file lean.

---

## Shared Patterns

### Discriminated-union return shape

**Source:** `src/channel-client.ts:3-10`
**Apply to:** All new canvas helpers (`writeCanvasReply`, `patchCanvasJson`, `deliverCanvasReply`)

```typescript
export type SendPromptResult =
    | { ok: true; request_id: string }
    | { ok: false; error: string };
```

Caller branches on `.ok`. The reply step in `suggest.ts` uses this exact pattern at lines 114, 153, 163.

### Try / catch with Error-narrowing

**Source:** `src/channel-client.ts:42-46`
**Apply to:** `writeCanvasReply` (around `setData` + `requestSave`), `patchCanvasJson` (around `JSON.parse`)

```typescript
} catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
}
```

### Failure-UX triplet (callout-replace + log)

**Source:** `src/suggest.ts:114-121` (send failure), repeated at 139-149, 153-161
**Apply to:** All canvas-write failure paths in `selectSuggestion`'s `.canvas` branch (D-07)

```typescript
console.log(`{verb} failed: ${error}`);
const range = findCalloutBlock(editor, value, nearLine);
if (range) {
    replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, error));
}
```

**P16 addition (D-07):** add `new Notice("Inline Claude: Canvas API write failed. See console for details.")` and escalate `console.log` → `console.error` for the canvas branch only. Markdown branch keeps the existing `console.log`.

### Reuse-don't-rebuild for callout strings

**Source:** `src/callout.ts:27-44` (`buildResponseCallout`, `buildErrorCallout`)
**Apply to:** `writeCanvasReply` (delivers `buildResponseCallout(query, response)`) and `patchCanvasJson` (same)

The canvas write path differs only in *delivery* (`node.setData` vs `editor.replaceRange`); the *content* is the same callout string. Do NOT duplicate `buildResponseCallout` / `buildErrorCallout` inside `canvas.ts`.

### Console-logging convention

**Source:** `src/main.ts:43,53,61` and `src/suggest.ts:111,124,132,141,154,164` (lifecycle); none yet for `console.warn`/`console.error`
**Apply to:**
- `console.warn` for D-03 probe-miss (visible but non-blocking)
- `console.error` for D-07 canvas-API failure (true error)
- `console.log` for everything else (probe success, write success, request lifecycle)

### Test mock pattern (vi.hoisted + vi.mock("obsidian", importOriginal))

**Source:** `src/__tests__/channel-client.test.ts:6-16`, `src/__tests__/suggest.test.ts:54-62`
**Apply to:** New `src/__tests__/canvas.test.ts` if any obsidian-export needs overriding (not strictly required if tests just override on `App` instance)

```typescript
const { mockX } = vi.hoisted(() => ({ mockX: vi.fn() }));
vi.mock("obsidian", async (importOriginal) => {
    const original = await importOriginal<typeof import("obsidian")>();
    return { ...original, X: mockX };
});
```

### Async-flush idiom in tests

**Source:** `src/__tests__/suggest.test.ts:196,217,272,275`
**Apply to:** Any canvas test that exercises the full `selectSuggestion` flow

```typescript
vi.useFakeTimers();
// ... call code under test
await vi.advanceTimersByTimeAsync(0);     // flush async IIFE / microtasks
await vi.advanceTimersByTimeAsync(1000);  // advance one poll-interval tick
```

---

## No Analog Found

| File / Aspect | Reason | Substitute |
|---------------|--------|------------|
| Canvas runtime API (`view.canvas.nodes.get(id).setData(...)`) | Obsidian doesn't ship typings for the Canvas class — no analog in this repo or in `node_modules/obsidian/obsidian.d.ts` | RESEARCH.md Pattern 1 (local interface stub copied from `obsidian-advanced-canvas/src/@types/Canvas.d.ts`) |
| `vault.process(file, fn)` | Not used anywhere in current `src/` (the plugin only writes via `editor.replaceRange` and `vault.modify` is used in setup helpers, not pluggable patches) | RESEARCH.md Pattern 4 — direct from `obsidian.d.ts:6531` documentation |
| Probe-time editor identity (`node.child.editor === ctx.editor`) | First-of-its-kind in this repo | RESEARCH.md Pattern 2 + Pitfall 2 (DOM-containment fallback) |
| Test fixture for a real `.canvas` JSON file | No JSON-file test fixtures exist anywhere in `src/__tests__/` | Hand-built JSON-string fixture inline in test file (3 text nodes, tab-indented, valid per `jsoncanvas.org/spec/1.0`) |

For these four areas, RESEARCH.md's code examples (Patterns 1-4) are the substitute reference. Planner should cite RESEARCH.md line numbers in the PLAN action steps.

## Metadata

**Analog search scope:** `src/` (all `.ts` files), `src/__tests__/` (all `.test.ts` files), `src/__mocks__/obsidian.ts`
**Files scanned:** 14 source files + 5 test files + 1 mock file = 20
**Pattern extraction date:** 2026-04-29
