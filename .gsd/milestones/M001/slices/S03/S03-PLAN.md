# S03: End-to-end wiring + error handling

**Goal:** Complete the core loop — `;;question` in Obsidian → placeholder → channel POST → poll for reply → replace placeholder with Claude's response or error callout.
**Demo:** Type `;;What is markdown?` in a note → `> [!claude] Thinking...` appears → response replaces placeholder. Kill channel → type `;;test` → error callout appears. Disable plugin → no orphaned intervals.

## Must-Haves

- Plugin POSTs `{filename, line, query}` to channel server on suggestion select (R003)
- Polls `GET /poll/:id` until reply arrives, replaces `Thinking...` with response in `> [!claude]` callout (R007, R008)
- Channel unreachable, timeout, or error → `Thinking...` replaced with error callout (R009)
- Prior `> [!claude]` blocks remain in the note as natural conversation history (R011)
- Plugin unload cancels all active polling intervals — no orphaned timers (R012)
- Settings tab has `channelPort` and `pollingTimeoutMs` controls

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes (full Obsidian + channel + Claude Code for UAT)
- Human/UAT required: yes (manual verification in real Obsidian vault)

## Verification

- `npx vitest run` — all plugin tests pass (existing 15 + new callout helper + channel-client tests)
- `npm run build` — plugin builds without errors
- `cd channel && bun test` — channel tests still pass (27, no changes to channel)
- New test: `src/__tests__/callout.test.ts` includes tests for `buildResponseCallout`, `buildErrorCallout`, `findCalloutRange`, `replaceCalloutBlock`
- New test: `src/__tests__/channel-client.test.ts` tests `sendPrompt` and `pollReply` with mocked `requestUrl`
- Error path test: channel-client tests verify behavior when `requestUrl` throws (connection refused)

## Observability / Diagnostics

- Runtime signals: `console.log` messages on prompt send, poll cycle start/complete/timeout/error, and poller cleanup in `onunload`
- Inspection surfaces: active poller count via `plugin.activePollers.size`, channel health via `GET /health`
- Failure visibility: error callout in-document shows what went wrong (connection refused vs timeout vs HTTP error)
- Redaction constraints: none (no secrets in this flow)

## Integration Closure

- Upstream surfaces consumed: `src/callout.ts` (`insertCallout`, `buildCalloutText`), `src/suggest.ts` (`selectSuggestion`), `src/main.ts` (plugin lifecycle), `src/settings.ts` (settings interface), channel HTTP contract (`POST /prompt`, `GET /poll/:id`)
- New wiring introduced in this slice: `selectSuggestion` → `sendPrompt` → poll loop → callout replacement; `onunload` → cancel all active pollers
- What remains before the milestone is truly usable end-to-end: nothing — this is the final assembly slice

## Tasks

- [x] **T01: Add settings, callout helpers, and HTTP client module with tests** `est:1h`
  - Why: All new building blocks needed before wiring — settings for channel config, callout functions for response/error rendering and placeholder replacement, HTTP client for channel communication. Each is independently testable.
  - Files: `src/settings.ts`, `src/callout.ts`, `src/channel-client.ts`, `src/__tests__/callout.test.ts`, `src/__tests__/channel-client.test.ts`, `src/__mocks__/obsidian.ts`
  - Do: (1) Add `channelPort` (default 4321) and `pollingTimeoutMs` (default 30000) to settings interface, defaults, and settings tab. (2) Add `buildResponseCallout(query, response)`, `buildErrorCallout(query, errorMsg)`, `findCalloutRange(editor, nearLine, marker)`, and `replaceCalloutBlock(editor, range, newContent)` to `callout.ts`. (3) Create `src/channel-client.ts` with `sendPrompt(port, payload)` and `pollReply(port, requestId)` using Obsidian's `requestUrl`. (4) Add `requestUrl` mock to `src/__mocks__/obsidian.ts`. (5) Write unit tests for all new functions. Key constraints: `requestUrl` needs `{url, method, body, throw: false}` signature; `findCalloutRange` must scan ±10 lines from expected position; callout builders must match `> [!claude]` format with `> ` line prefixes.
  - Verify: `npx vitest run` passes with new tests, `npm run build` succeeds
  - Done when: All new functions exist, are exported, pass unit tests, and the plugin builds cleanly

- [x] **T02: Wire end-to-end loop with polling, error handling, and cleanup** `est:1h`
  - Why: Connects the building blocks into the live flow — selectSuggestion triggers POST, starts polling, replaces placeholder on completion or error, and cleans up on unload. This is the final assembly that makes the demo work.
  - Files: `src/suggest.ts`, `src/main.ts`, `src/callout.ts`, `src/channel-client.ts`, `src/__tests__/suggest.test.ts`
  - Do: (1) Add `activePollers: Map<string, number>` to `ClaudeChatPlugin`, add `registerPoller(id, intervalId)` and `cancelPoller(id)` methods. (2) In `onunload()`, iterate `activePollers` and `clearInterval` each, log cleanup. (3) In `selectSuggestion()`, after inserting placeholder: fire async IIFE that calls `sendPrompt()`, then starts `window.setInterval` polling via `plugin.registerInterval()`. On poll complete → `replaceCalloutBlock()` with response callout. On timeout → replace with error callout. On send failure → replace with error callout immediately. (4) Handle editor staleness: check active file matches before replacing. (5) Add `registerInterval` to obsidian mock. (6) Add tests for the wiring: verify `selectSuggestion` calls `sendPrompt` and starts polling.
  - Verify: `npx vitest run` all tests pass, `npm run build` succeeds
  - Done when: `selectSuggestion` triggers the full async flow, errors produce error callouts, `onunload` cancels active pollers, all tests green, plugin builds

## Files Likely Touched

- `src/settings.ts`
- `src/callout.ts`
- `src/channel-client.ts` (new)
- `src/main.ts`
- `src/suggest.ts`
- `src/__mocks__/obsidian.ts`
- `src/__tests__/callout.test.ts`
- `src/__tests__/channel-client.test.ts` (new)
- `src/__tests__/suggest.test.ts`
