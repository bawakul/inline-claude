---
estimated_steps: 5
estimated_files: 6
skills_used:
  - test
---

# T01: Add settings, callout helpers, and HTTP client module with tests

**Slice:** S03 — End-to-end wiring + error handling
**Milestone:** M001

## Description

Create all the building blocks for the end-to-end loop before wiring them together. This task adds channel configuration to plugin settings, extends the callout module with response/error rendering and placeholder replacement logic, creates an HTTP client module for channel communication, and writes comprehensive unit tests for everything new. Each piece is independently testable — no integration wiring happens here.

## Steps

1. **Extend settings** — In `src/settings.ts`, add `channelPort: number` (default `4321`) and `pollingTimeoutMs: number` (default `30000`) to the `ClaudeChatSettings` interface and `DEFAULT_SETTINGS`. Add two new `Setting` entries in the `display()` method: a text field for channel port and a text field for polling timeout (both with numeric parsing). The port default matches the channel server's default `PORT` env/fallback.

2. **Add callout helpers** — In `src/callout.ts`, add four new exported functions:
   - `buildResponseCallout(query: string, response: string): string` — Returns `> [!claude]+\n> **Q:** {query}\n> \n> {response lines prefixed with > }`. The `+` makes the callout collapsible in Obsidian. Each line of the response gets `> ` prefix.
   - `buildErrorCallout(query: string, errorMsg: string): string` — Returns `> [!claude] Error\n> **Q:** {query}\n> \n> ⚠️ {errorMsg}`. Uses same `> ` line prefix pattern.
   - `findCalloutRange(editor: Editor, nearLine: number, marker: string): {from: number, to: number} | null` — Scans lines `max(0, nearLine-10)` to `min(lineCount, nearLine+10)` looking for a line that starts with `marker` (default: `> [!claude] Thinking...`). Once found, scans forward to find the end of the callout block (first line not starting with `> ` or end of document). Returns `{from, to}` line numbers (inclusive). Returns `null` if marker not found.
   - `replaceCalloutBlock(editor: Editor, from: number, to: number, newContent: string): void` — Replaces lines `from` through `to` (inclusive) with `newContent`. Uses `editor.replaceRange()` with positions `{line: from, ch: 0}` to `{line: to, ch: editor.getLine(to).length}`.

3. **Create HTTP client** — Create `src/channel-client.ts` with two exported async functions:
   - `sendPrompt(port: number, payload: {filename: string, line: number, query: string}): Promise<{ok: true, request_id: string} | {ok: false, error: string}>` — Calls `requestUrl({url: \`http://127.0.0.1:${port}/prompt\`, method: "POST", body: JSON.stringify(payload), headers: {"Content-Type": "application/json"}, throw: false})`. On status 200, parses JSON for `request_id`. On non-200, returns error from response body. On exception (connection refused), catches and returns error string.
   - `pollReply(port: number, requestId: string): Promise<{ok: true, status: "pending"} | {ok: true, status: "complete", response: string} | {ok: false, error: string}>` — Calls `requestUrl({url: \`http://127.0.0.1:${port}/poll/${requestId}\`, method: "GET", throw: false})`. Parses response JSON. On 200 with status "complete", includes response. On 200 with "pending", returns pending. On non-200 or exception, returns error.
   - Import `requestUrl` from `"obsidian"`. This is provided at runtime (see K001, K002).

4. **Update obsidian mock** — In `src/__mocks__/obsidian.ts`, add:
   - `export async function requestUrl(params: any): Promise<any>` — default mock that throws "not mocked". Tests will `vi.mock` or `vi.spyOn` this.
   - `registerInterval(id: number): number` method on the `Plugin` class (returns the id). This is needed for T02 but adding it now keeps the mock complete.

5. **Write unit tests** — Add tests to `src/__tests__/callout.test.ts` (append to existing file):
   - `buildResponseCallout` — single-line response, multi-line response, empty response
   - `buildErrorCallout` — formats error message correctly
   - `findCalloutRange` — finds callout at exact line, finds callout shifted ±5 lines, returns null when no callout, stops at block boundary
   - `replaceCalloutBlock` — calls replaceRange with correct positions
   Create `src/__tests__/channel-client.test.ts`:
   - `sendPrompt` — success case returns `{ok: true, request_id}`, non-200 returns `{ok: false, error}`, connection error returns `{ok: false, error}`
   - `pollReply` — pending returns `{ok: true, status: "pending"}`, complete returns `{ok: true, status: "complete", response}`, 404 returns error, connection error returns error

## Must-Haves

- [ ] `ClaudeChatSettings` includes `channelPort` and `pollingTimeoutMs` with defaults
- [ ] Settings tab renders controls for both new settings
- [ ] `buildResponseCallout` produces valid `> [!claude]` callout with query and response
- [ ] `buildErrorCallout` produces error-styled callout with query and error message
- [ ] `findCalloutRange` locates a callout block within ±10 lines of expected position
- [ ] `replaceCalloutBlock` replaces the correct line range via `editor.replaceRange`
- [ ] `sendPrompt` handles success, HTTP error, and connection refused
- [ ] `pollReply` handles pending, complete, HTTP error, and connection refused
- [ ] All new functions have passing unit tests
- [ ] `npm run build` succeeds

## Verification

- `npx vitest run` — all tests pass (existing + new callout + channel-client tests)
- `npm run build` — plugin compiles without errors
- `grep -q "channelPort" src/settings.ts` — setting exists
- `grep -q "sendPrompt" src/channel-client.ts` — HTTP client exists

## Inputs

- `src/settings.ts` — existing settings interface to extend
- `src/callout.ts` — existing callout module to extend
- `src/__mocks__/obsidian.ts` — existing mock to add `requestUrl` to
- `src/__tests__/callout.test.ts` — existing test file to append to

## Expected Output

- `src/settings.ts` — extended with `channelPort` and `pollingTimeoutMs`
- `src/callout.ts` — extended with `buildResponseCallout`, `buildErrorCallout`, `findCalloutRange`, `replaceCalloutBlock`
- `src/channel-client.ts` — new HTTP client module
- `src/__mocks__/obsidian.ts` — extended with `requestUrl` mock and `registerInterval`
- `src/__tests__/callout.test.ts` — extended with new function tests
- `src/__tests__/channel-client.test.ts` — new test file

## Observability Impact

- **Settings surface:** `channelPort` and `pollingTimeoutMs` are inspectable via `plugin.settings` at runtime. Future agents can read these to verify configuration before debugging connection issues.
- **Callout helpers:** Pure functions — no runtime state. Testable via unit tests. Failure is visible as malformed callout text in the editor.
- **Channel client:** `sendPrompt` and `pollReply` return structured `{ok, error}` results. Error messages include the failure reason (connection refused, HTTP status, timeout). T02 will add `console.log` at call sites; this task provides the structured error surface those logs will consume.
- **Mock surface:** `requestUrl` mock in `__mocks__/obsidian.ts` is the test-time inspection point. Tests verify all three outcomes (success, HTTP error, network error) for both client functions.
