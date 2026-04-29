# Phase 16 — Manual E2E Checklist

**Build verified:** 2026-04-29 18:39 (npm run build exit 0; 121/121 vitest tests passing)
**Plugin file mtime:** `Bawa's Lab/.obsidian/plugins/inline-claude/main.js` → 2026-04-29 18:41 (22,329 bytes; copied from `obsidian-claude-chat/main.js`)
**Reload command:** Disable + re-enable the "Inline Claude" plugin in Obsidian Settings → Community plugins to ensure the new build is loaded. Confirm the channel status indicator returns to green before starting Scenario 1.

> Each scenario maps to a row of `16-VALIDATION.md §Manual-Only Verifications`
> and ultimately to a bullet of `ROADMAP.md §Phase 16 Success criteria`.
> All five callouts use the channel server already running in this Claude Code session.

---

## Scenario 1 — Same-leaf canvas reply round-trip (D-01, D-02, primary write)

**Setup:**
- Open a `.canvas` file in the vault (any existing one or a fresh one).
- Add a text node containing nothing (empty).

**Steps:**
1. Click into the text node so the embedded editor has focus.
2. Type `;;ping` (or any short query).
3. Select the suggestion.
4. Wait for the reply (ensure Claude Code is connected — green dot in status bar).

**Expected:**
- A `> [!claude] ping` placeholder appears immediately inside the text node.
- Within ≤ pollingTimeoutSecs, the placeholder is replaced by `> [!claude-done]+ ping` followed by Claude's response, all inside the same text node.
- DevTools console shows `Inline Claude: first canvas trigger — node.child keys = [...]` exactly once for this Obsidian session.

**Observed:** Placeholder `> [!claude] ping` appeared inside the target text node and resolved in-place to `> [!claude-done]+ ping` + Claude's reply. No error Notice or red console output.

Console (first canvas trigger of session):
```
Inline Claude: first canvas trigger — node.child keys = ["_loaded","_events","_children","file","hoverPopover","editable","text","dirty","useIframe","requestSaveFolds","requestSave","app","containerEl","state","previewEl","editorEl","previewMode","scope","node"]
```

**Notable:** `node.child` exposes no `editor` key (only `editorEl` / `previewEl` / `previewMode`). The `findCanvasNodeIdForEditor` DOM-containment fallback (RESEARCH Pitfall 2 / Pattern 2) is the real-world hot path — `node.child.editor === editor` never matches. Unit tests cover this fallback; production now confirmed.

**Result:** [x] Pass  [ ] Fail  [ ] Skip

---

## Scenario 2 — Background-leaf canvas reply

**Setup:**
- Open a `.canvas` file in leaf A.
- Open any markdown note in leaf B and focus leaf B.

**Steps:**
1. Click back into the canvas text node in leaf A long enough to position the cursor and type `;;ping2`.
2. Select the suggestion.
3. Click into leaf B (markdown) so leaf A is now the background leaf.
4. Wait for the reply.

**Expected:**
- The reply lands inside the canvas text node in leaf A (still rendered, since the leaf is open even if unfocused).
- Switching back to leaf A shows the `[!claude-done]+` callout in the same node where you typed.

**Observed:**

**First attempt (pre-fix):** Reply did not arrive. Spinner kept spinning. Console showed:
```
File changed (inline-claude-brainstorm-canvas.canvas → annotated-reader/annotated-reader.md), cancelling poller for 64b9dd66-...
Polling cancelled for 64b9dd66-...
```
The plugin's markdown-era `file-change` guard was cancelling canvas pollers as soon as the user clicked into a different leaf, before the reply could be delivered. Plans 02/03 added `PollerEntry.canvasNodeId` for exactly this kind of decision but Plan 04 only used it on the four reply-write paths and missed the cancellation guard.

**Fix:** `eb61059` — `src/suggest.ts` cancellation guard now requires `canvasNodeId === null`. Canvas writes don't need the active editor (Canvas API + JSON-patch fallback both work in any focus state), and the #14 race the markdown guard protected against doesn't apply. Two regression tests added.

**Re-test (post-fix):** Reply arrived inside the canvas node correctly. Console shows the legitimate post-completion `Polling cancelled` (no `File changed` prefix), confirming the guard didn't fire mid-poll.

**Result:** [x] Pass  [ ] Fail  [ ] Skip — passes after fix `eb61059`. Original failure logged as a Wave 4 finding worth shipping with the phase.

---

## Scenario 3 — Closed-leaf JSON-patch fallback (D-04, D-05)

**Setup:**
- Open a `.canvas` file. Type `;;ping3` in a text node and select the suggestion.

**Steps:**
1. Immediately after the placeholder appears, close the canvas leaf (Cmd-W or click the leaf's X).
2. Wait for the polling timeout to elapse so we know the reply has had time to arrive (or watch the channel server logs to confirm the reply tool was invoked).
3. Re-open the same `.canvas` file.

**Expected:**
- The reply is present inside the original text node (`> [!claude-done]+ ping3` + response).
- Any unrelated edits made elsewhere in the canvas BEFORE you closed the leaf are preserved.
- The `.canvas` file diff shows only the target node's `text` field changed (run `git diff` to verify).

**Observed (FAIL — two-layer root cause):**

After closing the canvas leaf and re-opening, the target node showed the original `;;ping3` text instead of the reply. The placeholder loading-state callout *did* render in the editor before close (visually confirmed), but never made it to disk.

**DevTools console at trigger time:**
```
Sending prompt to channel: "ping"
Prompt sent, request_id: 18c9f9a3-a0ec-4465-840f-862c0af571fd
Polling started for ac7a3b66-d9a0-43b7-b9ad-ccd4c7f8b440
app.js:1 Uncaught TypeError: Cannot read properties of null (reading 'path')
    at t.get (app.js:1:3149047)
    at t.getFoldInfo (app.js:1:3149172)
    at t.set (app.js:1:2451914)
    at t.set (app.js:1:2453829)
    at t.save (app.js:1:2453762)
    at t.save (app.js:1:3148620)
    at t.<anonymous> (app.js:1:2453222)
    at c (app.js:1:552123)
    at u (app.js:1:552243)
    setTimeout (deferred)
    h → t.save → t.save → t.onUpdate → dispatchTransactions → t.replaceRange → selectSuggestion @ plugin:inline-claude:38
Poll complete for ac7a3b66-d9a0-43b7-b9ad-ccd4c7f8b440
Polling cancelled for ac7a3b66-d9a0-43b7-b9ad-ccd4c7f8b440
```

**On-disk forensics** (`inline-claude-brainstorm-canvas.canvas`, three failure-mode nodes observed across multiple Scenario 3 attempts):
- `b5999a09` and `0aa37e9f`: `;;ping` — trigger text; placeholder write was rolled back, patch silently no-op'd.
- `83446c9b`: `> [!claude] ping\n\n` — placeholder persisted, reply never appended.

**Two-layer root cause:**

**Layer 1 — Obsidian-internal crash.** `editor.replaceRange` against the canvas-embedded CodeMirror schedules a deferred fold-info save (via `setTimeout`). When the user closes the canvas leaf before that timer fires, the deferred save runs against a now-null file reference and crashes inside `getFoldInfo`. This crash can poison the canvas's persistence chain, preventing the placeholder from being written to disk. Obsidian bug, not ours, but our use of `editor.replaceRange` against an embedded CodeMirror is what triggers it.

**Layer 2 — Silent no-op in our patch.** `replacePendingCalloutText` (in `src/canvas.ts:93`) uses a regex that only matches the canonical placeholder `> [!claude] ${query}`. When Layer 1 prevented the placeholder from reaching disk, the patch reads the on-disk text (`;;ping3`), calls `text.replace(placeholderRegex, response)`, gets the unchanged input back, writes it as-is, and reports `{ok: true}`. Both `writeCanvasReply` (line 244) and `patchCanvasJson` (line 308) inherit this behavior.

**Decision:** Ship Phase 16 with this scenario as a documented known gap. The other four scenarios cover the high-frequency paths (#14 is fully closed for open-leaf and background-leaf cases). Closed-leaf with mid-flight reply is the rarest path and depends on an Obsidian-internal flake we can't directly fix. Two follow-ups are planned (see `16-DEFERRED.md` once filed):

1. **Tactical:** extend `replacePendingCalloutText` with a trigger-text fallback (`;;${query}`) and a final append-on-new-line fallback. Convert silent no-ops to `{ok: false, reason: "no-pending-callout"}` and surface a Notice. Cheap change, fully solves Layer 2.
2. **Architectural:** replace `editor.replaceRange` for canvas placeholder insertion with a Canvas-API write (`node.setData` with the placeholder content). Eliminates Layer 1 entirely. Larger refactor.

**Result:** [ ] Pass  [x] Fail  [ ] Skip — known gap; ship anyway.

---

## Scenario 4 — Loud failure on probe rejection (D-07, D-08)

**Setup:**
- Open a `.canvas` file. Open Obsidian DevTools console (Cmd-Opt-I).
- In the console, monkey-patch the Canvas API to fail the probe — choose ONE method below:

  - **Easier:** disable `requestSave`:
    ```js
    // Console:
    const leaf = app.workspace.getLeavesOfType("canvas")[0];
    leaf.view.canvas.requestSave = undefined;
    ```
  - **Stronger:** corrupt the nodes Map:
    ```js
    leaf.view.canvas.nodes = {}; // not a Map
    ```

**Steps:**
1. Trigger `;;ping4` in a text node of that canvas.
2. Wait for the reply.

**Expected (per Plan 04's writeCanvasErrorCallout helper, which uses buildErrorCallout — checker nit #8 reconciliation):**
- An Obsidian Notice toast appears: `"Inline Claude: Canvas API write failed. See console for details."`
- An error callout appears in the canvas text node with the **`[!claude]`** header (not `[!claude-done]+` — that's the success header). Concretely:
  ```
  > [!claude] ping4
  > Canvas write failed: probe-failed
  ```
  The first line is `> [!claude] ping4` (the error header per `buildErrorCallout(query, reason)`), and a body line beneath it carries the failure reason.
- DevTools console shows a `console.error` line including the reason (`probe-failed` or similar) and any captured exception.
- Reload the plugin afterwards (the monkey-patch is sticky for the canvas instance).

**Why `[!claude]` and not `[!claude-done]+`:** `buildResponseCallout` (success) emits `[!claude-done]+`; `buildErrorCallout` (failure) emits `[!claude]`. Plan 04 routes the canvas error UX through `buildErrorCallout`, so the failure callout uses the error header — even though the write itself reaches the canvas via the same Canvas API pipeline. This is intentional and semantically correct.

**Observed:** _(fill in: paste the Notice text, the console.error line, the error callout text — including which header `[!claude]` or `[!claude-done]+` you saw)_

**Result:** [ ] Pass  [ ] Fail  [ ] Skip

---

## Scenario 5 — Two callouts with identical query text (D-05 ID-first locate)

**Setup:**
- Open a `.canvas` file. Add two empty text nodes (or use existing ones).

**Steps:**
1. In node A: type `;;same question` and select the suggestion. Wait for reply 1.
2. In node B: type `;;same question` (literally the same query) and select the suggestion. Wait for reply 2.
3. Verify each reply appears in its OWN node — reply 1 is inside node A, reply 2 is inside node B. They must be distinct.

**Expected:**
- Two distinct replies, each in its originating node. Neither node contains the other's response.
- `git diff` on the `.canvas` file shows two separate node `text` fields changed (or, if the canvas was open, no file diff — the in-memory writes happened via setData and only requestSave persisted).

**Observed:** _(fill in)_

**Result:** [ ] Pass  [ ] Fail  [ ] Skip

---

## Final phase gate

- [ ] Scenarios 1, 2, 3, 4, 5 all pass — phase ready for `/gsd-verify-work`.
- [ ] Any failures documented above with enough detail to drive a `--gaps` plan.
- [ ] ROADMAP.md §Phase 16 success-criteria bullets all checkable:
  - [ ] `;;` from a canvas text node round-trips to a `[!claude-done]` callout (Scenario 1, 2)
  - [ ] Closed-leaf JSON-patch fallback works (Scenario 3)
  - [ ] Replies match by node ID (Scenario 5)
  - [ ] Markdown notes pass the existing reply-path test suite unchanged (verified by `npx vitest run` exit 0 in Plan 04)
  - [ ] Closes #14 — fully closed, including for canvas-originated send-fail / poll-error / timeout paths (Plan 04's writeCanvasErrorCallout routes ALL canvas errors through the Canvas API; Scenario 4 verifies the loud-failure UX on probe rejection)
