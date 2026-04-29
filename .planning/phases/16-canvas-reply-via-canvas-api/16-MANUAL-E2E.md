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

**Observed:** _(fill in: paste the console "node.child keys" line; describe what you saw)_

**Result:** [ ] Pass  [ ] Fail  [ ] Skip — _(reason)_

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

**Observed:** _(fill in)_

**Result:** [ ] Pass  [ ] Fail  [ ] Skip

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

**Observed:** _(fill in; paste a `git diff --stat` if useful)_

**Result:** [ ] Pass  [ ] Fail  [ ] Skip

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
