---
estimated_steps: 5
estimated_files: 5
skills_used:
  - test
---

# T02: Wire end-to-end loop with polling, error handling, and cleanup

**Slice:** S03 — End-to-end wiring + error handling
**Milestone:** M001

## Description

Connect all T01 building blocks into the live flow. When the user selects a suggestion, `selectSuggestion()` fires an async flow: POST prompt to channel → start polling interval → on reply, replace placeholder with response callout → on timeout or error, replace with error callout. Active pollers are tracked on the plugin instance and cleaned up on unload. This is the final assembly that makes the `;;question → response` demo work.

## Steps

1. **Add poller tracking to plugin** — In `src/main.ts`:
   - Add `activePollers: Map<string, number> = new Map()` property to `ClaudeChatPlugin`.
   - Add `registerPoller(requestId: string, intervalId: number): void` — stores in map, logs `"Polling started for ${requestId}"`.
   - Add `cancelPoller(requestId: string): void` — calls `window.clearInterval(id)`, deletes from map, logs `"Polling cancelled for ${requestId}"`.
   - In `onunload()`, iterate `activePollers`, call `window.clearInterval` on each, clear the map, log `"Cleaned up ${count} active pollers"`. This satisfies R012.

2. **Wire selectSuggestion async flow** — In `src/suggest.ts`:
   - Import `sendPrompt`, `pollReply` from `../channel-client`.
   - Import `buildResponseCallout`, `buildErrorCallout`, `findCalloutRange`, `replaceCalloutBlock` from `../callout`.
   - After `insertCallout(editor, start, end, value)` and setting `this.plugin.lastQuery`, add an async IIFE `(async () => { ... })()` — do NOT await it (EditorSuggest `selectSuggestion` is synchronous).
   - Inside the IIFE:
     a. Call `sendPrompt(this.plugin.settings.channelPort, {filename, line: start.line, query: value})`.
     b. If `!result.ok`, immediately call `findCalloutRange` + `replaceCalloutBlock` with `buildErrorCallout(value, result.error)`, return.
     c. On success, extract `request_id`. Start polling with `window.setInterval(async () => { ... }, 1000)`. Register the interval via `this.plugin.registerInterval(intervalId)` (Obsidian auto-cleanup) AND `this.plugin.registerPoller(request_id, intervalId)` (explicit tracking).
     d. Track elapsed time. Inside each poll tick: call `pollReply(port, request_id)`. If complete → `findCalloutRange` + `replaceCalloutBlock` with `buildResponseCallout(value, response)`, cancel poller, return. If error → replace with error callout, cancel poller, return. If elapsed > `pollingTimeoutMs` → replace with error callout `"Timed out waiting for Claude's response"`, cancel poller, return.
     e. Before any replacement, check the file context: capture `file.path` at the start. Before replacing, verify the active file is still the same (via `this.plugin.app.workspace.getActiveFile()?.path`). If different, cancel the poller silently — the user navigated away.

3. **Handle the placeholder marker** — The current `insertCallout` in `src/callout.ts` inserts `> [!claude] Thinking...\n> {query}`. The `findCalloutRange` from T01 searches for `> [!claude] Thinking...` as the marker. Verify the marker string matches between insertion and finding. If `buildCalloutText` in `callout.ts` needs adjustment for the marker to be consistent, update it. The key constraint: the marker text in `insertCallout` output must be exactly what `findCalloutRange` searches for.

4. **Update obsidian mock for wiring tests** — In `src/__mocks__/obsidian.ts`:
   - Ensure `Plugin` class has `registerInterval(id: number): number` (added in T01).
   - Add a `workspace` property to `App` with `getActiveFile(): TFile | null` returning a `TFile` with path `"test.md"`.

5. **Add wiring tests** — In `src/__tests__/suggest.test.ts`, add tests for the new wiring behavior:
   - Test that `selectSuggestion` calls `sendPrompt` with the correct port and payload (mock `sendPrompt` via `vi.mock("../channel-client")`).
   - Test that on send failure, `findCalloutRange` and `replaceCalloutBlock` are called with error callout content.
   - Test the poll-complete path: mock `pollReply` to return complete on first call, verify `replaceCalloutBlock` is called with response callout.
   - Test the timeout path: mock `pollReply` to always return pending, advance timers with `vi.useFakeTimers()` past `pollingTimeoutMs`, verify error callout.
   - These tests will need `vi.useFakeTimers()` and `vi.advanceTimersByTime()` to drive the polling intervals.

## Must-Haves

- [ ] `selectSuggestion` fires async POST to channel and starts polling (R003)
- [ ] Poll completes → placeholder replaced with response callout (R007, R008)
- [ ] Send failure → immediate error callout (R009)
- [ ] Poll timeout → error callout with timeout message (R009)
- [ ] Poll error → error callout (R009)
- [ ] Active pollers tracked on plugin and cleaned up in `onunload` (R012)
- [ ] File navigation during poll → poller cancelled silently
- [ ] Marker text consistent between insertion and finding
- [ ] All existing tests still pass alongside new wiring tests

## Verification

- `npx vitest run` — all tests pass
- `npm run build` — plugin builds without errors
- `cd channel && bun test` — channel tests still pass (unchanged)
- `grep -q "activePollers" src/main.ts` — poller tracking exists
- `grep -q "sendPrompt" src/suggest.ts` — wiring exists

## Inputs

- `src/settings.ts` — T01 output with `channelPort` and `pollingTimeoutMs`
- `src/callout.ts` — T01 output with `buildResponseCallout`, `buildErrorCallout`, `findCalloutRange`, `replaceCalloutBlock`
- `src/channel-client.ts` — T01 output with `sendPrompt` and `pollReply`
- `src/__mocks__/obsidian.ts` — T01 output with `requestUrl` mock and `registerInterval`
- `src/main.ts` — existing plugin class to extend
- `src/suggest.ts` — existing suggest class to wire

## Expected Output

- `src/main.ts` — extended with `activePollers` map, `registerPoller`, `cancelPoller`, cleanup in `onunload`
- `src/suggest.ts` — `selectSuggestion` wired to POST → poll → replace/error async flow
- `src/__mocks__/obsidian.ts` — extended with `workspace.getActiveFile()` on App
- `src/__tests__/suggest.test.ts` — extended with wiring, timeout, and error path tests
