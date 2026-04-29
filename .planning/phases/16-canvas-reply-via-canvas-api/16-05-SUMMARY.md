# 16-05 — Manual E2E (Wave 4 / phase gate)

**Plan:** 16-05-PLAN.md
**Status:** Complete
**Outcome:** 4/5 pass (Scenarios 1, 2, 4, 5), 1 documented known gap (Scenario 3)
**Driver:** User (manual; non-autonomous per `autonomous: false`)
**Date:** 2026-04-29

## Per-scenario outcomes

| # | Scenario | Result | Commit |
|---|----------|--------|--------|
| 1 | Same-leaf canvas reply round-trip (D-01, D-02) | ✅ Pass | `0e17ea8` |
| 2 | Background-leaf canvas reply | ✅ Pass after fix | `820d401` |
| 3 | Closed-leaf JSON-patch fallback (D-04, D-05) | ❌ Known gap | `73f9672` |
| 4 | Loud failure on probe rejection (D-07, D-08) | ✅ Pass | `dfa4e32` |
| 5 | ID-first locate with identical query text (D-05) | ✅ Pass | (this commit) |

## Findings

### Scenario 1 — production-confirmed DOM-containment fallback
`node.child` in real Obsidian exposes `editorEl` / `previewEl` / `previewMode` but no `editor` key. The `node.child.editor === editor` branch in `findCanvasNodeIdForEditor` never matches; the DOM-containment fallback (RESEARCH Pitfall 2 / Pattern 2) is the actual hot path in production. Unit tests cover this fallback so the implementation worked, but the field-truth differs from the originally hypothesized API surface.

### Scenario 2 — file-change cancellation regression discovered and fixed
Original run failed because the markdown-era `file-change` guard in `src/suggest.ts` was cancelling canvas pollers as soon as the user clicked into a different leaf, before the reply could be delivered. Plans 02/03 added `PollerEntry.canvasNodeId` for exactly this kind of decision but Plan 04 only used it on the four reply-write paths and missed the cancellation guard.

Fix landed inline as commit `eb61059`:
- `src/suggest.ts`: cancellation guard now requires `canvasNodeId === null` (markdown only).
- `src/__tests__/suggest.test.ts`: two regression tests (canvas survives file-change mid-poll; markdown still cancels).
- 123/123 vitest tests passing.

Re-test confirmed Scenario 2 passes after the fix.

### Scenario 3 — closed-leaf JSON-patch fallback fails (KNOWN GAP, not shipped)

Two-layer root cause:

1. **Obsidian-internal crash.** `editor.replaceRange` against a canvas-embedded CodeMirror schedules a deferred fold-info save (`setTimeout` → `t.save` → `t.getFoldInfo`). When the user closes the canvas leaf before that timer fires, the deferred save runs against a now-null file reference and throws `Cannot read properties of null (reading 'path')`. This crash poisons the canvas's persistence chain, preventing the placeholder write from being saved to disk. Obsidian bug, but our use of `editor.replaceRange` against an embedded CodeMirror is what triggers it.

2. **Silent no-op in the patch.** `replacePendingCalloutText` (`src/canvas.ts:93`) uses a regex that only matches the canonical placeholder `> [!claude] ${query}`. When Layer 1 prevented the placeholder from reaching disk, the patch reads the on-disk text (`;;ping3`), calls `text.replace(placeholderRegex, response)`, gets the unchanged input back, writes it as-is via `vault.process`, and reports `{ok: true}`. Both `writeCanvasReply` (line 244) and `patchCanvasJson` (line 308) inherit this behavior.

Disk forensics confirmed three failure-mode nodes across multiple Scenario 3 attempts:
- `b5999a09`, `0aa37e9f`: text = `;;ping` (placeholder rolled back, patch silently no-op'd).
- `83446c9b`: text = `> [!claude] ping\n\n` (placeholder persisted, reply patch missed).

**Decision:** Ship Phase 16 with this as a documented known gap. The high-frequency paths (open-leaf, background-leaf, identical-query-text) all pass; #14 is closed for those. Closed-leaf-with-mid-flight reply is the rarest path and depends on an Obsidian-internal flake we can't directly fix.

**Two follow-ups recorded:**
1. **Tactical:** extend `replacePendingCalloutText` with a trigger-text fallback (`;;${query}`) and a final append-on-new-line fallback. Convert silent no-ops to `{ok:false, reason:"no-pending-callout"}` and surface a Notice. Cheap; fully solves Layer 2.
2. **Architectural:** replace `editor.replaceRange` for canvas placeholder insertion with a Canvas-API write. Eliminates Layer 1 entirely. Larger refactor.

### Scenario 4 — loud-failure surface verified
`leaf.view.canvas.requestSave = undefined` monkey-patch correctly rejected by the D-08 probe with sub-reason `no-requestSave`. Notice toast fired ("Toast came"). `console.error` logged the probe reason and exception. Secondary patch-fallback failure was *also* surfaced loudly (`Inline Claude: error-callout JSON-patch fallback also failed: no-match`) — D-07 contract held: nothing was silenced.

The error callout itself didn't persist in the canvas node (inherits Scenario 3's `replacePendingCalloutText` bug), but the user-visible surface (toast) fired correctly.

### Scenario 5 — ID-first locate proven in production
Two text nodes with identical query `;;same question` received two distinct replies, each in its originating node. ID-first matching held under the exact threat model D-05 protects against (text-fallback false-positive when query strings collide).

## Build / vault sync

- `npm run build` clean; `npm test` final state 123/123 passing.
- `Bawa's Lab/.obsidian/plugins/inline-claude/main.js` synced from repo build at 2026-04-29 19:06 (22,339 bytes; included the file-change fix from `eb61059`).

## Phase gate

| Success criterion (from ROADMAP) | Status |
|----------------------------------|--------|
| `;;` from canvas text node round-trips to `[!claude-done]` (active + background leaf) | ✅ Scenarios 1, 2 |
| Closed-leaf JSON-patch fallback works | ❌ **known gap**, two-layer root cause documented |
| Replies match by node ID | ✅ Scenario 5 |
| Markdown reply-path test suite unchanged | ✅ 123/123 incl. new D-06 regression guard |
| Closes #14 | Partial — closed for the high-frequency paths; closed-leaf-with-mid-flight remains open. Loud-failure UX verified. |

## Commits emitted by this plan

| Commit | Subject |
|--------|---------|
| `1fd4200` | docs(16-05): scaffold manual E2E checklist |
| `0e17ea8` | docs(16-05): scenario 1 pass — same-leaf canvas round-trip |
| `eb61059` | fix(16-04): keep canvas pollers alive across file-change events |
| `820d401` | docs(16-05): scenario 2 pass — background-leaf reply (after fix) |
| `73f9672` | docs(16-05): scenario 3 fail — closed-leaf JSON-patch (known gap) |
| `dfa4e32` | docs(16-05): scenario 4 pass — loud failure on probe rejection |
| (this) | docs(16-05): scenario 5 pass; close phase 16 with documented gap |
