# Phase 16: canvas-reply-via-canvas-api - Research

**Researched:** 2026-04-29
**Domain:** Obsidian Canvas internal API + JSON Canvas file format + plugin reply-write fork
**Confidence:** HIGH (Canvas API shape and JSON format) / MEDIUM (probe-time editor identity) / HIGH (vault.process atomicity)

## Summary

This phase forks the reply-write step in `src/suggest.ts` so that `.canvas` files write through Obsidian's in-memory Canvas API (`view.canvas.nodes.get(id).setData(...)` + `canvas.requestSave()`) instead of `editor.replaceRange`. A trigger-time probe captures the canvas node ID and stows it on the existing `activePollers` map. When no canvas leaf is open at reply time, a JSON-patch fallback writes through `vault.process()` (atomic read-modify-write).

The research surfaced **one material correction to CONTEXT.md D-08**: the plan calls for probing `node.setText`, but the canonical community-typed Canvas API has **no `setText` method**. The correct mutation pattern is `node.setData({ ...currentData, text: newText })`. This must be addressed in planning before implementation. Everything else in CONTEXT.md is consistent with what the API actually exposes.

The Canvas API itself is **not in `obsidian.d.ts`** — `obsidian-api/canvas.d.ts` upstream contains only data-shape types (`CanvasTextData`, `CanvasNodeData`), no `Canvas` or `CanvasView` class. The runtime shape is documented exclusively in community plugin type stubs (Advanced Canvas, Enchanted Canvas). The four-shape probe in D-08 is the right defensive posture; we just need to fix which methods it checks.

A second material risk: `Vault.process` / `Vault.modify` is documented to silently no-op when an Obsidian save is debouncing on the same file — so the JSON-patch fallback (D-04) is safe ONLY when no canvas leaf is open (which is the precondition CONTEXT.md already assumes). This validates the D-04 reasoning but means the fallback must not be reached when a leaf IS open — even if the API probe failed.

**Primary recommendation:** Plan a new `src/canvas.ts` module with `probeCanvasApi()`, `findCanvasNodeIdForEditor()`, `writeCanvasReply()`, and `patchCanvasJson()`. Use `node.setData()` not `node.setText()`. Match probe-time editor identity through `view.canvas.nodes.values()` iterating `node.child.editor` (which exists as `MarkdownFileInfo.editor`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Node ID round-trip:**
- **D-01:** At `;;` trigger time, when `filename.endsWith('.canvas')`, identify the canvas node by **probing `view.canvas.nodes`** — find the leaf matching the file via `workspace.getLeavesOfType('canvas')`, iterate `view.canvas.nodes.values()`, and match by editor instance (the suggest hook's `EditorSuggestContext.editor` should `===` the canvas node's embedded CodeMirror editor). Pure Canvas API. No file artifacts.
- **D-02:** The captured `canvasNodeId` lives on the `activePollers` map entry alongside `intervalId` (extend the value shape from `number` to `{ intervalId: number, canvasNodeId?: string }`). Same lifetime as the pending request — auto-cleaned when the poller cancels. No parallel data structure.
- **D-03:** If the trigger-time probe misses (no node in the Map matches the editor instance), capture no ID and fall back to query-text matching at reply time (same approach as the markdown path). Log a `console.warn` so the failure is visible without blocking the user.

**Closed-canvas fallback:**
- **D-04:** When no canvas leaf is open for the file at reply time, **JSON-patch the `.canvas` file silently** via `vault.read` → `JSON.parse` → mutate node text → `vault.modify`. No Notice — success is silent like the markdown path. User sees the reply the next time they open the canvas.
- **D-05:** Inside the JSON, locate the target node by **node ID first, query-text fallback**. If we have an ID from D-01, find `canvasJson.nodes` entry where `node.id === capturedId` and replace its `text` field. If the trigger-time probe missed, iterate text nodes scanning each `node.text` for `> [!claude] {query}` and replace in place.

**Markdown path unification:**
- **D-06:** **Markdown reply path stays untouched.** Only the canvas path gets node-ID round-trip. Two code paths, branched by `filename.endsWith('.canvas')`.

**Failure surface:**
- **D-07:** When the Canvas API write fails (typed-narrow probe rejects, mutation throws, or `requestSave` throws), surface the failure **loudly**: replace the placeholder with an error callout *and* show a Notice toast (`"Inline Claude: Canvas API write failed. See console for details."`). `console.error` with the full exception.
- **D-08:** The typed-narrow probe checks four things: (a) `leaf.view.canvas` exists, (b) `.nodes` is a `Map`, (c) `.nodes.get(id)?.setText` is a function, (d) `.canvas.requestSave` is a function. If any check fails, treat it as an API-rename failure per D-07 — do NOT silently fall back to JSON patch (that would hide the canary). Log the probe result on the first canvas write per session for forensics.

**Branch point:**
- **D-09 (implied):** The `.canvas` branch lives in the reply-write step, not at trigger. The trigger path stays generic (insert callout, register poller). Only when `pollResult.status === "complete"` do we fork: if `filename.endsWith('.canvas')`, route through new `writeCanvasReply()`; otherwise use existing `replaceCalloutBlock`.

> **Researcher note on D-08:** see `## D-08 Probe Correction` below — `node.setText` does NOT exist on the Canvas API surface. The probe must check `node.setData` (or `node.child.data` for read-back). This is a research finding, not a decision change; the planner should refine D-08 in PLAN.md or escalate to discuss-phase.

### Claude's Discretion

- Test strategy for the Canvas API path (vitest mock of `view.canvas.nodes` Map, plus manual E2E in a real canvas note). Researcher / planner will pick.
- Exact shape of `writeCanvasReply()` — whether it lives in `src/callout.ts`, `src/canvas.ts` (new file), or inline in `suggest.ts`. Planner decides.
- How `app.workspace.getActiveFile()?.path` interacts with split-leaf canvas views (ROADMAP.md doesn't call out multi-leaf disambiguation; planner can use first matching leaf and document the assumption).
- Whether to add the captured `canvasNodeId` to the channel server payload (would need a schema bump on `channel.js` and `channel-client.ts`) or keep it purely in plugin-side state. Plugin-side preferred unless researcher finds a reason.

### Deferred Ideas (OUT OF SCOPE)

- **Multi-leaf canvas disambiguation** — if the same `.canvas` file is open in multiple leaves, which one wins? Not surfaced in scope; planner can use first-match-by-file-path. Add to backlog if it ever causes a real bug.
- **Channel-server schema bump for `canvas_node_id`** — keeping the ID plugin-side per D-02 means no wire-format change. If a future phase needs the ID server-side, revisit.
- **Markdown duplicate-query collision** — D-06 leaves this open. Markdown duplicate-query callouts collide on `findCalloutBlock`. Low impact in practice; revisit only if reported.
- **Atomic JSON-patch write / conflict with Obsidian opening the canvas mid-write** — D-04's "silent JSON patch" assumes vault.modify is atomic enough. If a real race surfaces, add a check via `getLeavesOfType('canvas')` immediately before write to upgrade to the Canvas API path.
</user_constraints>

<phase_requirements>
## Phase Requirements

This phase has **no REQ-IDs from REQUIREMENTS.md** — it's driven entirely by CONTEXT.md decisions D-01..D-09 and the ROADMAP.md success criteria. The closest existing requirement is R007 (poll-and-replace loop), which the markdown path already validates; P16 extends this loop to canvas without breaking R007 for markdown.

| Pseudo-ID | Description | Research Support |
|-----------|-------------|------------------|
| P16-S1 | Reply round-trips into the same canvas text node when the canvas is the active leaf | `view.canvas.nodes.get(id).setData({...d, text: newText})` then `canvas.requestSave()` — see Code Examples |
| P16-S2 | Reply round-trips into a background canvas leaf (file open but not focused) | `workspace.getLeavesOfType('canvas')` returns ALL canvas leaves; iterate to find one whose `view.file.path === filePath` |
| P16-S3 | With canvas leaf closed, JSON-patch fallback writes the reply | `vault.process(file, fn)` — atomic, but see Pitfall 1 about debounce conflicts |
| P16-S4 | Two `;;` callouts with identical query text receive distinct replies (ID-first matching) | Capture `canvasNodeId` at trigger via editor-instance match against `node.child.editor`, store on `activePollers` entry |
| P16-S5 | Markdown notes pass existing 69-test suite unchanged | Branch in `selectSuggestion` reply step, not at trigger; `.canvas` extension check is the only fork |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trigger detection (`;;`) | Plugin / EditorSuggest | — | Already done; reuses existing `findTrigger()` |
| Canvas-node ID capture at trigger | Plugin / Canvas API probe | — | New: iterate `view.canvas.nodes`, match by editor instance |
| Pending-state tracking | Plugin / `activePollers` Map | — | Existing structure; extend value shape |
| HTTP request to channel server | Plugin / `channel-client.ts` | Channel server (Bun) | Unchanged; out of scope |
| Reply write — markdown | Plugin / `editor.replaceRange` | — | Unchanged per D-06 |
| Reply write — canvas (open leaf) | Plugin / Canvas API mutation | — | New `writeCanvasReply()`: `node.setData()` + `canvas.requestSave()` |
| Reply write — canvas (closed leaf) | Plugin / Vault FS | — | New `patchCanvasJson()`: `vault.process()` for atomic JSON edit |
| Failure-surface UX | Plugin / Notice + error callout | — | Reuses `buildErrorCallout`; adds Notice for canvas-API rejections |

**Why this matters:** every capability is plugin-side. The channel server is read-only for P16 (per D-02 — no wire-format bump). No browser-tier work, no API-tier work. The fork is fully contained in `src/suggest.ts` reply step + new `src/canvas.ts` module.

## Standard Stack

### Core (already in repo — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| obsidian | 1.12.3 | Plugin API, Editor, Vault, Workspace, EditorSuggest | The host. `[VERIFIED: npm view obsidian version → 1.12.3, matches node_modules/obsidian/package.json]` |
| vitest | 4.1.5 | Test runner with fake timers + `vi.mock` | Already used for all 69 plugin tests `[VERIFIED: package.json + npm view]` |
| typescript | ~5.7 | Strict typing for the new probe + interface stubs | Already in repo |
| esbuild | ^0.25 | Bundler — `main.js` output | Unchanged |

### Supporting (Canvas-specific TypeScript stubs — write inline, no install)

| Item | Purpose | When to Use |
|------|---------|-------------|
| Local `Canvas`/`CanvasNode`/`CanvasView` interface stubs | Narrow the `unknown` Canvas shape so TS compiles cleanly | Inside `src/canvas.ts`; copied/abridged from `obsidian-advanced-canvas/src/@types/Canvas.d.ts` `[CITED: github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/src/@types/Canvas.d.ts]` |
| `CanvasTextData` from `obsidian` | Type the data we pass to `node.setData()` | The official `obsidian-api/canvas.d.ts` exports `CanvasTextData` (data-only, no methods) `[CITED: github.com/obsidianmd/obsidian-api/blob/master/canvas.d.ts]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `vault.process(file, fn)` for JSON patch | `vault.read` + `vault.modify` (as CONTEXT.md proposes) | `process` is **atomic read-modify-write**; `read+modify` is two-step and racier `[CITED: obsidian.d.ts:6531-6545 — "Atomically read, modify, and save"]`. Recommend upgrading the plan to `vault.process`. |
| Wire `canvasNodeId` through the channel server | Plugin-side state on `activePollers` | Plugin-side wins (D-02): no schema bump, no version-skew risk. Confirmed correct — server has no use for the ID. |
| Probe `node.setText` (per D-08 as written) | Probe `node.setData` | `setText` does **not exist** on CanvasNode in any community-typed surface. `setData(data, addHistory?)` is canonical. **D-08 needs correction.** |

**Installation:** None. All work is in existing modules + one new file (`src/canvas.ts`).

**Version verification:**
- `obsidian@1.12.3` — installed locally, matches npm registry latest `[VERIFIED: 2026-04-29]`
- `vitest@^3.0` declared in package.json; npm latest is 4.1.5 `[VERIFIED]` — current install (`^3.0`) is fine; not in scope to upgrade

## Architecture Patterns

### System Architecture Diagram

```
   ┌────────────────────────────────────────────────────────────┐
   │   USER TYPES `;;query` IN CANVAS TEXT NODE                 │
   └────────────────────────┬───────────────────────────────────┘
                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │   ClaudeSuggest.onTrigger → selectSuggestion (existing)    │
   │   • Already inserts callout placeholder via editor.replaceRange │
   │   • Existing: getActiveFile()?.path → "x.canvas"           │
   └────────────────────────┬───────────────────────────────────┘
                            ▼
                  ┌─────────┴─────────┐
                  │ filename.endsWith │
                  │   ('.canvas') ?   │
                  └─┬───────────────┬─┘
              YES   │               │   NO
                    ▼               ▼
   ┌────────────────────────┐  ┌─────────────────────────────┐
   │ NEW: probeCanvasApi()  │  │ Existing markdown path —    │
   │  + findCanvasNodeId    │  │  capture nothing extra      │
   │  ForEditor(ctx.editor) │  └─────────────┬───────────────┘
   │ → canvasNodeId | null  │                │
   └─────────────┬──────────┘                │
                 ▼                            │
   ┌────────────────────────┐                │
   │ activePollers.set(id,  │                │
   │   {intervalId,         │                │
   │    canvasNodeId?})     │                │
   └─────────────┬──────────┘                │
                 ▼                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │   sendPrompt → poll loop (existing channel-client) — UNCHANGED │
   └────────────────────────┬───────────────────────────────────┘
                            ▼
                  pollResult.status === "complete"
                            │
                  ┌─────────┴─────────┐
                  │ filename.endsWith │
                  │   ('.canvas') ?   │
                  └─┬───────────────┬─┘
              YES   │               │   NO
                    ▼               ▼
   ┌────────────────────────┐  ┌─────────────────────────────┐
   │ NEW: writeCanvasReply  │  │ replaceCalloutBlock         │
   │ (existing markdown UX) │  │  (unchanged)                │
   └─────────────┬──────────┘  └─────────────────────────────┘
                 ▼
       getLeavesOfType('canvas')
       filtered to view.file.path === filename
                 │
       ┌─────────┴────────────┐
       │ at least one leaf?   │
       └─┬──────────────────┬─┘
   YES   │                  │   NO
         ▼                  ▼
   ┌──────────────┐  ┌────────────────────────────────┐
   │ probe shape  │  │ patchCanvasJson via            │
   │  4 checks    │  │  vault.process(file, fn)       │
   │ (D-08)       │  │  • parse JSON                   │
   └──┬────────┬──┘  │  • find node by id OR query text│
   OK │   FAIL │     │  • update text                  │
      ▼        ▼     │  • return JSON.stringify        │
   setData    Notice │  No Notice on success.          │
   +request   +error │                                 │
   Save       callout└────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── canvas.ts          # NEW — probeCanvasApi, findCanvasNodeIdForEditor,
│                      #       writeCanvasReply, patchCanvasJson
├── callout.ts         # unchanged
├── channel-client.ts  # unchanged
├── main.ts            # extend activePollers value type
├── suggest.ts         # add canvas branch at trigger + reply
└── __tests__/
    ├── canvas.test.ts # NEW — probe success/fail, write success/fail, JSON patch
    └── suggest.test.ts # extend with canvas-fork tests
```

### Pattern 1: Canvas API access via local interface stub

**What:** Cast the untyped `view.canvas` to a local interface that mirrors the runtime shape. Keep the stub minimal — only the methods we actually call.

**When to use:** Always — the public `obsidian.d.ts` does not expose Canvas. This is the standard community pattern.

**Example:**
```typescript
// src/canvas.ts
// Source: github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/src/@types/Canvas.d.ts
// Minimal stub — only what writeCanvasReply needs.
import type { TFile, View } from "obsidian";
import type { CanvasNodeData, CanvasTextData } from "obsidian/canvas"; // data-only types ARE exported

interface CanvasNodeMin {
    id: string;
    child: { data: string; editor?: import("obsidian").Editor };
    getData(): CanvasNodeData;
    setData(data: CanvasNodeData, addHistory?: boolean): void;
}
interface CanvasMin {
    nodes: Map<string, CanvasNodeMin>;
    requestSave(): void;
}
interface CanvasViewMin extends View {
    canvas?: CanvasMin;
    file: TFile;
}
```
`[CITED: github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/src/@types/Canvas.d.ts — full schema]`

### Pattern 2: Probe-time node identification by editor identity

**What:** At `;;` trigger inside a `.canvas`, iterate every canvas leaf for the file, then iterate `view.canvas.nodes.values()` and compare `node.child.editor === ctx.editor`.

**When to use:** Inside `selectSuggestion` immediately after `filename.endsWith('.canvas')` is true.

**Example:**
```typescript
// src/canvas.ts
export function findCanvasNodeIdForEditor(
    app: App,
    filePath: string,
    editor: Editor,
): string | null {
    const leaves = app.workspace.getLeavesOfType("canvas");
    for (const leaf of leaves) {
        const view = leaf.view as unknown as CanvasViewMin;
        if (!view?.canvas || view.file?.path !== filePath) continue;
        for (const node of view.canvas.nodes.values()) {
            // Embedded text-node editor — child.editor is the same Editor instance
            // that EditorSuggest receives in ctx.editor.
            if (node.child?.editor === editor) return node.id;
        }
    }
    return null;
}
```
**Confidence:** MEDIUM. The community-typed `CanvasNode.child` exposes `data: string` and `editMode.cm.dom` `[CITED: advanced-canvas Canvas.d.ts]`. The presence of `child.editor` (an `Editor` instance) is **inferred** from `MarkdownFileInfo.editor?: Editor` `[VERIFIED: obsidian.d.ts:3833]` and the deepwiki note that "workspace's activeEditor can point to an EmbeddedEditor component when users click on file cards within the canvas" `[CITED: deepwiki.com/obsidianmd/obsidian-api/4.1-canvas-system]`. Validate with a runtime probe + console.log on first canvas trigger.

**Fallback if `child.editor` is undefined at runtime:** match by `node.child.editMode?.cm?.dom?.contains(editor.cm?.dom)` or compare `editor.cm.contentDOM` ancestry to `node.contentEl`. Plan should include a console.warn for this case so the discrepancy is visible.

### Pattern 3: Canvas-API write via setData (NOT setText)

**What:** Mutate text by spreading existing data and overriding `text`.

**When to use:** Inside `writeCanvasReply` when a canvas leaf is open and the probe succeeds.

**Example:**
```typescript
// src/canvas.ts
export function writeCanvasReply(
    app: App,
    filePath: string,
    nodeId: string | null,
    query: string,
    response: string,
): { ok: true } | { ok: false; reason: "no-leaf" | "probe-failed" | "no-match" | "exception"; error?: unknown } {
    const leaves = app.workspace.getLeavesOfType("canvas");
    const leaf = leaves.find(l => (l.view as any)?.file?.path === filePath);
    if (!leaf) return { ok: false, reason: "no-leaf" };

    const view = leaf.view as unknown as CanvasViewMin;

    // Probe (D-08, corrected — see "D-08 Probe Correction" below)
    if (!view.canvas) return { ok: false, reason: "probe-failed" };
    if (!(view.canvas.nodes instanceof Map)) return { ok: false, reason: "probe-failed" };
    if (typeof view.canvas.requestSave !== "function") return { ok: false, reason: "probe-failed" };

    let node: CanvasNodeMin | undefined;
    if (nodeId) {
        node = view.canvas.nodes.get(nodeId);
    }
    if (!node) {
        // ID-first miss → query-text fallback per D-05
        for (const n of view.canvas.nodes.values()) {
            const d = n.getData() as CanvasTextData;
            if (d.type === "text" && d.text?.startsWith(`> [!claude] ${query}`)) {
                node = n;
                break;
            }
        }
    }
    if (!node) return { ok: false, reason: "no-match" };
    if (typeof node.setData !== "function") return { ok: false, reason: "probe-failed" };

    try {
        const current = node.getData() as CanvasTextData;
        const newText = current.text.replace(
            // Replace the pending callout block with the response callout.
            // Pending = `> [!claude] {query}` block. Response = buildResponseCallout(query, response).
            // For the JSON-stored text, we replace the entire pending callout (lines starting with `>`).
            new RegExp(`> \\[!claude\\] ${escapeRegex(query)}(\\n>.*)*`, "m"),
            buildResponseCallout(query, response),
        );
        node.setData({ ...current, text: newText });
        view.canvas.requestSave();
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: "exception", error };
    }
}
```
`[CITED: github.com/Developer-Mike/obsidian-advanced-canvas — node.setData(data, addHistory?) is canonical]`
`[CITED: github.com/borolgs/enchanted-canvas — canvas.requestSave() is the post-mutation save trigger]`

### Pattern 4: Atomic JSON patch via vault.process

**What:** Use Obsidian's `Vault.process(file, fn)` — read, transform, save in one atomic call.

**When to use:** Closed-leaf fallback (D-04). **Replaces** the CONTEXT.md proposal of `vault.read` → `JSON.parse` → `vault.modify`.

**Example:**
```typescript
// src/canvas.ts
export async function patchCanvasJson(
    app: App,
    filePath: string,
    nodeId: string | null,
    query: string,
    response: string,
): Promise<{ ok: true } | { ok: false; reason: "no-file" | "no-match" | "parse-error"; error?: unknown }> {
    const file = app.vault.getFileByPath(filePath);
    if (!file) return { ok: false, reason: "no-file" };

    let result: { ok: true } | { ok: false; reason: "no-match" | "parse-error"; error?: unknown } = { ok: true };

    await app.vault.process(file, (data) => {
        try {
            const json = JSON.parse(data) as { nodes?: Array<{ id: string; type: string; text?: string }>; edges?: unknown[] };
            const nodes = json.nodes ?? [];

            // ID-first per D-05
            let target = nodeId ? nodes.find(n => n.id === nodeId) : undefined;

            // Query-text fallback
            if (!target) {
                target = nodes.find(n =>
                    n.type === "text" && n.text?.startsWith(`> [!claude] ${query}`)
                );
            }

            if (!target || target.type !== "text" || !target.text) {
                result = { ok: false, reason: "no-match" };
                return data; // unchanged
            }

            target.text = target.text.replace(
                new RegExp(`> \\[!claude\\] ${escapeRegex(query)}(\\n>.*)*`, "m"),
                buildResponseCallout(query, response),
            );
            return JSON.stringify(json, null, "\t"); // Obsidian uses tab indentation
        } catch (error) {
            result = { ok: false, reason: "parse-error", error };
            return data;
        }
    });

    return result;
}
```
`[CITED: obsidian.d.ts:6531-6545 — "Atomically read, modify, and save the contents of a note", since 1.1.0]`

**Indentation note:** Real `.canvas` files in this vault use **tab indentation** `[VERIFIED: head -50 inline-claude-brainstorm-canvas.canvas]`. Use `JSON.stringify(json, null, "\t")` to preserve format — `JSON.stringify(json)` (no spaces) and 2-space indentation will both produce noisy diffs.

### Anti-Patterns to Avoid

- **Anti-pattern 1: Using `vault.read` + `vault.modify` for the JSON patch.** Two non-atomic ops; if Obsidian writes the file between read and modify, the plugin clobbers user edits. `vault.process` is the documented atomic primitive `[CITED: obsidian.d.ts:6531]`. CONTEXT.md D-04 proposes the two-step pattern; planner should upgrade to `process`.

- **Anti-pattern 2: Calling Canvas API methods without a try/catch.** The internal API can throw (rename, refactor, leaf in a transitional state). D-07 already requires loud failure — this means try/catch around `setData` AND `requestSave` AND the entire probe.

- **Anti-pattern 3: `editor.replaceRange` against the canvas node sub-editor.** This is the #14 bug — silently no-ops once focus leaves the node. Do NOT keep this as a fallback inside the canvas branch.

- **Anti-pattern 4: Probing `setText`.** Method does not exist `[CITED: github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/src/@types/Canvas.d.ts]`. The probe will reject 100% of canvas writes if D-08 is implemented as written. **Plan must correct this to `setData`.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file read-modify-write | `vault.read` + `JSON.parse` + `vault.modify` | `vault.process(file, fn)` | Documented atomic since Obsidian 1.1.0; eliminates the read-modify-clobber race `[CITED: obsidian.d.ts:6531]` |
| Canvas leaf lookup | Manual workspace iteration with `iterateAllLeaves` | `workspace.getLeavesOfType('canvas')` | Single typed call `[VERIFIED: obsidian.d.ts:7050]` |
| File-by-path lookup | `vault.getAbstractFileByPath` + `instanceof TFile` | `vault.getFileByPath(path)` (since 1.5.7) | Already typed for TFile-or-null `[VERIFIED: obsidian.d.ts:6386]` |
| Canvas node mutation | Hand-build the full canvas data structure | `node.setData({ ...node.getData(), text: newText })` | Spread preserves x/y/width/height/color and any forward-compat fields `[CITED: advanced-canvas Canvas.d.ts]` |
| Save scheduling | Manual debounce on top of `vault.modify` | `canvas.requestSave()` | The host's debouncer; respects pending in-memory dirty state |
| JSON Canvas validation | Hand-build a schema check | Trust `JSON.parse` + duck-type the `nodes[].id` / `nodes[].type` / `nodes[].text` fields | Spec is stable + minimal `[CITED: jsoncanvas.org/spec/1.0.html]` |

**Key insight:** Every Canvas-mutation primitive we need (probe, lookup, mutate, save) already exists either in the typed Obsidian API (`getLeavesOfType`, `vault.process`, `vault.getFileByPath`) or in the runtime canvas API (`node.setData`, `canvas.requestSave`). The only thing we hand-write is the type stub for the runtime canvas API — and that's a copy-paste from a popular community plugin's type file, not novel design.

## Common Pitfalls

### Pitfall 1: `vault.process` / `vault.modify` silently no-ops during requestSave debounce
**What goes wrong:** If we call `vault.process` on a `.canvas` file while Obsidian is mid-debounce (within ~2s of a recent save), the call may not actually persist `[CITED: forum.obsidian.md/t/107862]`.
**Why it happens:** Obsidian's internal save queue can race the API call.
**How to avoid:** D-04's "JSON patch only when no canvas leaf is open" precondition is exactly the right mitigation — closed leaves can't be debouncing a save. The Canvas API path (open leaf) bypasses this risk because `requestSave` IS the host's save mechanism.
**Warning signs:** A reply that "succeeds" silently but doesn't appear when the canvas is reopened. Test plan must include re-opening the canvas after a closed-leaf write.

### Pitfall 2: `node.child.editor` may not be the same instance as `EditorSuggestContext.editor`
**What goes wrong:** D-01's editor-identity match (`node.child.editor === ctx.editor`) returns false even when the user IS in that node, leaving every canvas trigger as a probe-miss → fallback to query-text matching.
**Why it happens:** Obsidian may wrap the embedded editor with a proxy, or `child` may not have `.editor` directly (the Advanced Canvas typing shows `child.data: string` and `child.editMode.cm.dom` — `editor` is an inferred extension).
**How to avoid:** Plan should include a one-time `console.log` of `{ ctxEditor: !!ctx.editor, nodeChildKeys: Object.keys(node.child) }` on the first canvas trigger per session. If `editor` is missing, fall through to a DOM-containment match: `node.contentEl.contains(editor.cm?.contentDOM)`.
**Warning signs:** Test "two `;;` callouts with identical query text receive distinct replies" fails — both replies land in the first match, indicating the ID was never captured.

### Pitfall 3: D-08 probe checks a method (`setText`) that doesn't exist
**What goes wrong:** The probe rejects every canvas write, every reply ends up in the loud-failure UX (Notice + error callout), feature appears 100% broken.
**Why it happens:** CONTEXT.md was written from training-data assumption that Canvas exposes `setText`. The canonical mutation method is `setData(data, addHistory?)`.
**How to avoid:** Replace D-08 check (c) — `(.nodes.get(id)?.setText)` — with `(.nodes.get(id)?.setData)`. Also check (d) `node.getData` if we read-modify-write the data envelope. **This is the single highest-priority correction in this research.**
**Warning signs:** Every canvas reply Notice shows "Canvas API write failed" even though the API itself is healthy.

### Pitfall 4: JSON patch produces noisy diff because of indentation drift
**What goes wrong:** User opens git diff, sees the entire `.canvas` file rewrapped from tabs to 2-space indentation (or vice versa).
**Why it happens:** Obsidian writes `.canvas` with tab indentation `[VERIFIED]`. `JSON.stringify(json)` produces no whitespace; `JSON.stringify(json, null, 2)` produces 2-space indent.
**How to avoid:** Use `JSON.stringify(json, null, "\t")`.
**Warning signs:** Single-text-change commits show 100s of lines of whitespace diff.

### Pitfall 5: Probe runs at trigger but canvas leaf is in a transitional state
**What goes wrong:** `;;` triggers during a canvas-leaf reload (e.g., user just dragged a card and Obsidian is rebuilding view); `view.canvas` is briefly undefined.
**Why it happens:** Obsidian rebuilds canvas views in a few cases (rebuildView, file-watcher reload).
**How to avoid:** Trigger-time probe miss is benign per D-03 — captures no ID, falls back to query-text. The reply-time probe still has its own retry path (open leaf → probe → JSON fallback if probe fails should be re-evaluated, but D-08 says NO silent fallback). For now, accept the loud-failure path.
**Warning signs:** Sporadic Notice toasts when the user is moving canvas cards while waiting on a reply.

### Pitfall 6: Multi-leaf canvas — same `.canvas` open in two leaves
**What goes wrong:** The plugin writes to leaf A, but the user is looking at leaf B. Or worse: leaf B's in-memory state diverges and overwrites leaf A on the next save.
**Why it happens:** `getLeavesOfType('canvas')` returns ALL leaves; "first match by file path" is a heuristic, not a guarantee that we hit the user's focused leaf.
**How to avoid:** Out of scope per CONTEXT.md "Deferred Ideas." Plan should prefer the leaf where `view.file.path === filePath` AND, if multiple match, prefer `app.workspace.activeLeaf` if it's one of them — but otherwise pick first match and document the assumption.
**Warning signs:** Replies appear in "the wrong split."

## Code Examples

### Example A: Trigger-time probe (in `selectSuggestion`)

```typescript
// src/suggest.ts (excerpt — modify after the existing filename resolution)
import { findCanvasNodeIdForEditor } from "./canvas";

// ... existing code through `const filename = ...; const nearLine = ...;`

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

// ... existing replaceRange + setCursor + lastQuery, then:

const pollerId = crypto.randomUUID();
// ... existing async IIFE ...

// Modified registerPoller call:
this.plugin.registerPoller(pollerId, intervalId, canvasNodeId);
```

### Example B: Extending `activePollers` value type

```typescript
// src/main.ts
type PollerEntry = { intervalId: number; canvasNodeId: string | null };

export default class ClaudeChatPlugin extends Plugin {
    activePollers: Map<string, PollerEntry> = new Map();
    // ...

    registerPoller(requestId: string, intervalId: number, canvasNodeId: string | null = null): void {
        this.activePollers.set(requestId, { intervalId, canvasNodeId });
    }

    cancelPoller(requestId: string): void {
        const entry = this.activePollers.get(requestId);
        if (entry !== undefined) {
            clearInterval(entry.intervalId);
            this.activePollers.delete(requestId);
        }
    }

    // onunload — update the iteration:
    onunload() {
        const count = this.activePollers.size;
        for (const [, entry] of this.activePollers) {
            clearInterval(entry.intervalId);
        }
        this.activePollers.clear();
        // ...
    }
}
```

### Example C: Reply-time fork (in `selectSuggestion`'s poll loop)

```typescript
// src/suggest.ts (excerpt — replace the existing pollResult.status === "complete" branch)
if (pollResult.status === "complete") {
    console.log(`Poll complete for ${pollerId}`);

    if (filename.endsWith(".canvas")) {
        const entry = this.plugin.activePollers.get(pollerId);
        const nodeId = entry?.canvasNodeId ?? null;

        const result = await deliverCanvasReply(
            this.plugin.app,
            filename,
            nodeId,
            value,
            pollResult.response,
        );
        if (!result.ok) {
            // D-07: loud failure
            console.error(`Canvas reply failed: ${result.reason}`, result.error);
            new Notice("Inline Claude: Canvas API write failed. See console for details.");
            const range = findCalloutBlock(editor, value, nearLine);
            if (range) {
                replaceCalloutBlock(editor, range.from, range.to,
                    buildErrorCallout(value, `Canvas write failed: ${result.reason}`));
            }
        }
    } else {
        const range = findCalloutBlock(editor, value, nearLine);
        if (range) {
            replaceCalloutBlock(editor, range.from, range.to,
                buildResponseCallout(value, pollResult.response));
        }
    }

    this.plugin.cancelPoller(pollerId);
    return;
}
```

Where `deliverCanvasReply` is a small dispatcher that tries `writeCanvasReply` first and falls back to `patchCanvasJson` when there's no open leaf:

```typescript
// src/canvas.ts
export async function deliverCanvasReply(
    app: App, filePath: string, nodeId: string | null, query: string, response: string,
) {
    const result = writeCanvasReply(app, filePath, nodeId, query, response);
    if (result.ok) return result;
    if (result.reason === "no-leaf") {
        return await patchCanvasJson(app, filePath, nodeId, query, response);
    }
    return result; // probe-failed | no-match | exception bubble up to D-07 loud failure
}
```

## D-08 Probe Correction (Research Finding)

CONTEXT.md D-08 specifies four probe checks:
> (a) `leaf.view.canvas` exists, (b) `.nodes` is a `Map`, (c) `.nodes.get(id)?.setText` is a function, (d) `.canvas.requestSave` is a function.

Check (c) is **incorrect** based on every available source on the Canvas API runtime shape:

- **Source 1 (canonical):** `obsidian-advanced-canvas/src/@types/Canvas.d.ts` defines `CanvasNode.setData(data, addHistory?): void` — no `setText` `[CITED: github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/src/@types/Canvas.d.ts]`.
- **Source 2 (corroborating):** `borolgs/enchanted-canvas` README example: `next.setColor(node.color); canvas.requestSave();` — uses setters per-attribute, with `setData` for full mutation `[CITED: github.com/borolgs/enchanted-canvas]`.
- **Source 3 (data shape):** `obsidian-api/canvas.d.ts` defines `CanvasTextData.text: string` as the field. `setData(...)` accepts the full `CanvasTextData` envelope `[CITED: github.com/obsidianmd/obsidian-api/blob/master/canvas.d.ts]`.

**Recommended D-08 (corrected):** the probe checks (a) `leaf.view.canvas` exists, (b) `.nodes` is a `Map`, (c) `.nodes.get(id)?.setData` is a function, (d) `.canvas.requestSave` is a function, **(e new)** `.nodes.get(id)?.getData` is a function (we need it to read-modify-write the data envelope).

The mutation pattern then becomes:
```typescript
const current = node.getData() as CanvasTextData;
node.setData({ ...current, text: newText });
canvas.requestSave();
```

Planner should treat this as the corrected D-08 unless the user wants to reopen the discussion. Recommend planner notes the correction in PLAN.md and proceeds.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vault.read` + `vault.modify` for atomic edits | `vault.process(file, fn)` | Obsidian 1.1.0 | Eliminates read-modify-clobber race; documented atomic |
| `getAbstractFileByPath` + `instanceof TFile` | `vault.getFileByPath(path)` | Obsidian 1.5.7 | Direct typed return |
| Canvas API as inferred from training | Documented in community plugin type stubs (Advanced Canvas, Enchanted Canvas) | Ongoing community-maintained reverse-engineering | Stable enough to depend on with a try/catch + probe |
| `setText` (training assumption) | `setData(data, addHistory?)` | Always — `setText` never existed | **Material correction to D-08** |

**Deprecated/outdated:**
- Direct manipulation of `node.child.editMode.cm.editor` (CodeMirror 5 era) — Obsidian is on CodeMirror 6 throughout `[CITED: marcusolsson.github.io/obsidian-plugin-docs]`. `node.child.editor` (Editor wrapper) is the supported abstraction.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Obsidian (host) | All plugin code | ✓ | Manifest minAppVersion already set | — |
| `vault.process` API | Closed-leaf JSON patch | ✓ | 1.1.0+ (well below current) `[VERIFIED: obsidian.d.ts:6545]` | — |
| `vault.getFileByPath` | TFile lookup by path | ✓ | 1.5.7+ `[VERIFIED: obsidian.d.ts:6386]` | `getAbstractFileByPath + instanceof TFile` |
| `view.canvas` runtime API | Open-leaf write path | UNTYPED — verified via community plugins | n/a | JSON-patch fallback (D-04) |
| Node.js / npm | Build only | ✓ | already in use | — |
| vitest | Tests | ✓ | 3.x installed | — |

**Missing dependencies with no fallback:** None. The Canvas runtime API is the only "untyped" dependency, and the JSON-patch path is the documented fallback.

**Missing dependencies with fallback:** None blocking.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.x (declared `^3.0`); installed 3.x; latest is 4.1.5 — not in scope to upgrade |
| Config file | `vitest.config.ts` (exists at repo root) |
| Quick run command | `cd obsidian-claude-chat && npx vitest run src/__tests__/canvas.test.ts` |
| Full suite command | `cd obsidian-claude-chat && npx vitest run` |

### Phase Requirements → Test Map

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-01 (probe hit) | Trigger inside canvas text node captures correct `canvasNodeId` | unit | `npx vitest run src/__tests__/canvas.test.ts -t "probe finds node by editor identity"` | ❌ Wave 0 |
| D-03 (probe miss) | Trigger inside canvas with no matching node logs warn and proceeds with `canvasNodeId = null` | unit | `npx vitest run src/__tests__/canvas.test.ts -t "probe miss logs warn"` | ❌ Wave 0 |
| D-04 (closed-leaf JSON patch) | When no canvas leaf is open, `patchCanvasJson` writes via `vault.process` | unit | `npx vitest run src/__tests__/canvas.test.ts -t "json patch atomic write"` | ❌ Wave 0 |
| D-05 ID-first | `writeCanvasReply` matches by ID when present | unit | `npx vitest run src/__tests__/canvas.test.ts -t "matches by id"` | ❌ Wave 0 |
| D-05 text fallback | `writeCanvasReply` matches by query text when ID missing | unit | `npx vitest run src/__tests__/canvas.test.ts -t "matches by query text"` | ❌ Wave 0 |
| D-05 distinct queries | Two `;;` callouts with identical query receive distinct replies (only achievable with ID-first) | unit | `npx vitest run src/__tests__/canvas.test.ts -t "distinct replies for duplicate queries"` | ❌ Wave 0 |
| D-06 (markdown unchanged) | All existing 69 markdown tests pass unchanged | regression | `npx vitest run` | ✓ existing |
| D-07 (loud failure UX) | When `setData` throws, error callout written + `Notice` shown + `console.error` called | unit | `npx vitest run src/__tests__/canvas.test.ts -t "loud failure on api exception"` | ❌ Wave 0 |
| D-08 (probe rejects bad shape) | Probe rejects when `view.canvas` missing, `nodes` not a Map, `setData` missing, or `requestSave` missing | unit (parametrized) | `npx vitest run src/__tests__/canvas.test.ts -t "probe rejects"` | ❌ Wave 0 |
| D-09 (markdown branch unchanged) | `selectSuggestion` with `.md` filename calls `replaceCalloutBlock` not `writeCanvasReply` | unit | extend `suggest.test.ts` | ✓ extend |
| End-to-end (manual only) | `;;` from canvas → reply lands in same node, both with canvas active and with canvas as background leaf | manual E2E | Real Obsidian vault, real channel server | n/a |
| End-to-end closed-leaf | `;;` from canvas, close canvas leaf, wait for reply, reopen canvas → reply visible | manual E2E | Real Obsidian vault | n/a |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/canvas.test.ts` — fast (no full suite needed during canvas work)
- **Per wave merge:** `npx vitest run` — full 69-test suite + new canvas tests
- **Phase gate:** `npx vitest run` green AND manual E2E checklist (4 scenarios: open-leaf same-leaf, open-leaf background, closed-leaf, probe-fail loud-failure) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/canvas.test.ts` — covers D-01, D-03, D-04, D-05, D-07, D-08
- [ ] Mock helpers in test for `view.canvas.nodes` Map, `node.getData`/`setData`, `canvas.requestSave`
- [ ] Mock for `vault.process` in `src/__mocks__/obsidian.ts` — currently absent; add a minimal `Vault` class with `process(file, fn)` and `getFileByPath(path)` to support D-04 testing
- [ ] Test fixture: a sample `.canvas` file string (3 text nodes, valid JSON, tab-indented) for `patchCanvasJson` round-trip tests

**Mock shape for canvas tests (sketch):**
```typescript
// In test file or shared __mocks__
function makeCanvasViewMock(filePath: string, nodes: Array<{ id: string; text: string; editor?: any }>) {
    const nodeMap = new Map(nodes.map(n => [n.id, {
        id: n.id,
        child: { data: n.text, editor: n.editor },
        getData: vi.fn(() => ({ id: n.id, type: "text", text: n.text, x: 0, y: 0, width: 100, height: 100 })),
        setData: vi.fn(),
    }]));
    return {
        view: {
            file: { path: filePath },
            canvas: {
                nodes: nodeMap,
                requestSave: vi.fn(),
            },
        },
    };
}
// Then on plugin.app.workspace.getLeavesOfType:
plugin.app.workspace.getLeavesOfType = vi.fn(() => [makeCanvasViewMock("test.canvas", [...])]);
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `node.child.editor` exists at runtime as the same `Editor` instance that EditorSuggest receives in `ctx.editor` | Pattern 2 / Pitfall 2 | Probe always misses → all canvas replies use query-text fallback (D-03 handles this gracefully — degraded but functional). Validate at first run with console.log. |
| A2 | `vault.process` works correctly when no canvas leaf is open (no debounce conflict in that case) | Pitfall 1 / D-04 | If wrong: closed-leaf writes silently fail. Mitigation: add a dirty check via `getLeavesOfType('canvas')` immediately before write. |
| A3 | Real `.canvas` files use tab indentation in this vault | Pattern 4 | Verified by inspecting an actual file — HIGH confidence. |
| A4 | `JSON.stringify(json, null, "\t")` produces output indistinguishable from Obsidian's own canvas writes | Pattern 4 | Low risk: even if mismatch, semantic content is identical; only diff noise. |
| A5 | `getLeavesOfType('canvas')` returns leaves whose `view.file.path` is reliably set even for unfocused leaves | Architecture diagram | Verified in advanced-canvas plugin source — HIGH confidence. |

## Open Questions (RESOLVED)

1. **RESOLVED:** **`node.child.editor` runtime presence** — community-typed `child` shows `data: string` and `editMode.cm.dom`, not `.editor`. Is `child.editor` actually present, or do we need to traverse `child.editMode.cm` to a CodeMirror EditorView and compare to `ctx.editor.cm`?
   - What we know: `MarkdownFileInfo.editor?: Editor` exists and `workspace.activeEditor` IS a `MarkdownFileInfo` for canvas EmbeddedEditors `[CITED: deepwiki]`.
   - What's unclear: whether the Canvas's per-node `child` is itself a `MarkdownFileInfo`, or a different abstraction.
   - Recommendation: Plan a one-time runtime probe (console.log of `Object.keys(node.child)`) on the first canvas trigger. If `editor` is absent, use `node.contentEl.contains(editor.cm?.contentDOM)` as the identity test.

2. **RESOLVED:** **Reply-time probe-fail with leaf open: should we still try JSON patch as a last resort?**
   - D-08 says NO (probe-fail = loud failure, don't hide the canary). But that means a single API rename breaks every canvas user until the plugin is patched.
   - Recommendation: Keep D-08 as-is for the initial release (loud failure is the design goal per STATE.md). Revisit if the API surface proves more fragile than expected. Document this clearly in the error callout body so users know to file an issue.

3. **RESOLVED:** **What happens if `requestSave()` is debounced and the user immediately closes the canvas?**
   - Possibly the in-memory write is lost.
   - Recommendation: Out of scope for P16; if it surfaces, address by awaiting `view.requestSave` if Obsidian exposes a Promise-returning variant in newer versions.

## Project Constraints (from CLAUDE.md / project skills)

- **`./CLAUDE.md` exists at repo root.** None checked-in for `obsidian-claude-chat/` — only the vault-level instructions. The vault-level CLAUDE.md is about portfolio management; for code work it explicitly says "switch to GSD mode." So no GSD-specific code constraints.
- **`.claude/skills/` and `.agents/skills/`:** Neither exists in `obsidian-claude-chat/`. No project-skill rules to honor.
- **Existing code style (inferred from src/):** TypeScript strict, two-space indentation in TS source, tab indentation in `.canvas` files only, JSDoc comments on exported helpers, `console.log` for happy-path lifecycle and `console.error` for true failures (matched in D-07).
- **Test conventions:** vitest with `vi.useFakeTimers()`, mocks via `vi.hoisted` + `vi.mock`, `__mocks__/obsidian.ts` minimal-shape pattern. New canvas tests should follow the same pattern (extend the obsidian mock, don't add a new mocking framework).

## Sources

### Primary (HIGH confidence)
- `node_modules/obsidian/obsidian.d.ts` (1.12.3) — verified `Vault.process` (line 6545), `Vault.getFileByPath` (line 6386), `Workspace.getLeavesOfType` (line 7050), `Workspace.activeEditor` (line 6849), `MarkdownFileInfo.editor?: Editor` (line 3833). The Canvas class itself is NOT in this file.
- `github.com/obsidianmd/obsidian-api/blob/master/canvas.d.ts` — confirms `CanvasTextData.text: string` is the field; confirms NO Canvas class is in the official API.
- `github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/src/@types/Canvas.d.ts` — canonical community type stub; defines `Canvas.nodes: Map<string, CanvasNode>`, `Canvas.requestSave()`, `CanvasNode.setData(data, addHistory?)`, `CanvasNode.getData()`, `CanvasNode.child: { data: string, editMode: { cm: { dom: HTMLElement } } }`. NO `setText` exists.
- `jsoncanvas.org/spec/1.0` (via github.com/obsidianmd/jsoncanvas) — confirms text-node fields: id (required), type "text" (required), x/y/width/height (required), text (required), color (optional). Top-level: `{ nodes: [...], edges: [...] }`.
- Real `.canvas` file inspected at `/Users/.../inline-claude-brainstorm-canvas.canvas` — confirms tab indentation, JSON structure, observed `text` field carrying full `> [!claude-done]+` callout content.

### Secondary (MEDIUM confidence)
- `forum.obsidian.md/t/107862` (vault.process / vault.modify don't work with requestSave debounce) — known limitation; informs Pitfall 1 and validates D-04's "leaf-closed" precondition.
- `deepwiki.com/obsidianmd/obsidian-api/4.1-canvas-system` — confirms `workspace.activeEditor` points to an EmbeddedEditor inside canvas cards. Used to support A1.
- `github.com/borolgs/enchanted-canvas` — independent confirmation of `canvas.requestSave()` post-mutation pattern; uses `setColor` (per-attribute setter) and `createTextNode` patterns.

### Tertiary (LOW confidence — not relied on)
- Various forum threads on Canvas internals — too sparse to cite individually; mostly confirm "API is undocumented but stable."

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — obsidian@1.12.3 verified via npm + local install; vitest declared and installed.
- Architecture (diagram + layering): HIGH — every component is plugin-side; flows trace through verified Obsidian APIs.
- Probe API (D-08 correction): HIGH — `setData` confirmed by canonical community type file; `setText` confirmed absent in the same file.
- Probe-time editor identity (D-01): MEDIUM — relies on `node.child.editor` which is inferred from MarkdownFileInfo + EmbeddedEditor docs but not directly typed by community plugins. Plan should include runtime validation.
- JSON patch atomicity (D-04): HIGH — `vault.process` is a documented since-1.1.0 atomic primitive; the debounce-conflict caveat is honored by the "leaf-closed" precondition.
- Test infrastructure: HIGH — pattern is well-established in this repo; new tests fit the existing shape.
- Failure UX (D-07): HIGH — error callout + Notice + console.error matches existing markdown-error path with one addition (Notice).

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (Obsidian's internal canvas API is the moving piece; community type stubs have been stable across the 1.x series, but a `Canvas` class rename in a future Obsidian update would invalidate the probe — which is exactly the loud-failure mode D-07/D-08 anticipate)
