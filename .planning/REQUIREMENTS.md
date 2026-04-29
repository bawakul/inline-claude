# Requirements

This file is the explicit capability and coverage contract for the project.

## Validated

### R001 — Typing `;;` anywhere in a Markdown note opens an EditorSuggest dropdown
- Class: primary-user-loop
- Status: validated
- Description: Typing `;;` anywhere in a Markdown note opens an EditorSuggest dropdown
- Why it matters: This is the entry point to the entire interaction
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: validated
- Notes: Proven by 9 trigger detection tests + manual E2E in Obsidian vault. Trigger phrase configurable (R010).

### R002 — The dropdown shows the user's typed text after `;;` as a freeform suggestion item
- Class: primary-user-loop
- Status: validated
- Description: The dropdown shows the user's typed text after `;;` as a freeform suggestion item
- Why it matters: Users need to type arbitrary questions, not just pick from a fixed list
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: validated
- Notes: Proven by unit tests + manual E2E

### R003 — When user selects the suggestion, the plugin POSTs `{filename, line, query}` to the channel server's HTTP endpoint
- Class: core-capability
- Status: validated
- Description: When user selects the suggestion, the plugin POSTs `{filename, line, query}` to the channel server's HTTP endpoint
- Why it matters: Claude Code needs to know which file and where the cursor is
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S01, M001/S02
- Validation: validated
- Notes: Proven by channel-client tests + manual E2E

### R004 — Immediately after sending the prompt, a callout block is inserted at the cursor position
- Class: primary-user-loop
- Status: validated
- Description: Immediately after sending the prompt, a callout block is inserted at the cursor position
- Why it matters: Gives the user immediate feedback
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: M001/S03
- Validation: validated
- Notes: M006 changes the callout format: prompt as title, no body in source. DOM post-processor adds visual state.

### R005 — The channel server exposes an HTTP endpoint, receives plugin POSTs, and converts them to MCP events
- Class: core-capability
- Status: validated
- Description: The channel server exposes an HTTP endpoint, receives plugin POSTs, and converts them to MCP events
- Why it matters: Bridge between plugin and Claude Code
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: validated
- Notes: Proven by 12 integration tests + curl smoke tests

### R006 — The channel server registers a `reply` MCP tool that Claude Code calls to send responses back
- Class: core-capability
- Status: validated
- Description: The channel server registers a `reply` MCP tool that Claude Code calls to send responses back
- Why it matters: Completes the two-way bridge
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: validated
- Notes: Proven by integration tests + live Claude Code session

### R007 — After inserting the placeholder, the plugin polls for a reply and replaces the placeholder with the response
- Class: primary-user-loop
- Status: validated
- Description: After inserting the placeholder, the plugin polls for a reply and replaces the placeholder with the response
- Why it matters: Completes the user-visible loop
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S01, M001/S02
- Validation: validated
- Notes: M006 changes the replacement: poll loop no longer writes elapsed time to file. Only writes once at terminal state.

### R008 — Claude's response is inserted as a `> [!claude-done]+` collapsible callout block
- Class: primary-user-loop
- Status: validated
- Description: Claude's response is inserted as a `> [!claude-done]+` collapsible callout block
- Why it matters: Keeps responses as Obsidian-native elements
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: validated
- Notes: Proven by callout tests + manual E2E

### R009 — When the channel is unreachable, times out, or returns an error, an error callout replaces the placeholder
- Class: failure-visibility
- Status: validated
- Description: When the channel is unreachable, times out, or returns an error, an error callout replaces the placeholder
- Why it matters: No silent failures
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: validated
- Notes: M006 changes error styling: all errors orange, no red.

### R010 — The `;;` trigger phrase is configurable in the plugin's settings tab
- Class: core-capability
- Status: validated
- Description: The `;;` trigger phrase is configurable in the plugin's settings tab
- Why it matters: Users may want a different trigger
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: validated
- Notes: Proven by settings tests + manual verification

### R011 — Prior `[!claude]` blocks in the note are visible to Claude Code when it reads the file
- Class: core-capability
- Status: validated
- Description: Prior `[!claude]` blocks in the note are visible to Claude Code when it reads the file
- Why it matters: Enables multi-turn conversations
- Source: inferred
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: validated
- Notes: Implicit — Claude Code reads the file. Proven in live E2E session.

### R012 — All pollers and intervals are cleared when the plugin unloads
- Class: continuity
- Status: validated
- Description: All pollers and intervals are cleared when the plugin unloads
- Why it matters: Prevents resource leaks and stale state
- Source: inferred
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: validated
- Notes: registerInterval + cancelPoller in onunload

### R017 — All plugin source files reside in the obsidian-claude-chat/ project directory
- Class: constraint
- Status: validated
- Description: All plugin source files reside in the obsidian-claude-chat/ project directory
- Why it matters: GSD, git, and the code agree on where the project lives
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: none
- Validation: validated
- Notes: Completed in M003 — standalone project directory with own .git

### R018 — obsidian-claude-chat/ has its own .git with clean history
- Class: constraint
- Status: validated
- Description: obsidian-claude-chat/ has its own .git with clean history
- Why it matters: Decouples the plugin repo from the vault's git repo
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: none
- Validation: validated
- Notes: Completed in M003

### R019 — npm run build and npx vitest run pass from obsidian-claude-chat/
- Class: core-capability
- Status: validated
- Description: npm run build and npx vitest run pass from obsidian-claude-chat/
- Why it matters: The project works from its proper location
- Source: execution
- Primary owning slice: M003/S02
- Supporting slices: none
- Validation: validated — 69 plugin tests pass (vitest), build clean (esbuild) as of M007 completion. Test count reduced from 117 to 69 after removing 48 dead tests covering deleted post-processor code.
- Notes: 110 tests pass as of M005 completion

### R020 — .gsd/repo-meta.json gitRoot points at obsidian-claude-chat/
- Class: continuity
- Status: validated
- Description: .gsd/repo-meta.json gitRoot points at obsidian-claude-chat/
- Why it matters: GSD locates the git repo correctly
- Source: execution
- Primary owning slice: M003/S01
- Supporting slices: none
- Validation: validated
- Notes: Completed in M003

### R021 — git remote origin points to github.com/bawakul/inline-claude.git
- Class: continuity
- Status: validated
- Description: git remote origin points to github.com/bawakul/inline-claude.git
- Why it matters: Preserves existing GitHub repo
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: none
- Validation: validated
- Notes: Verified — remote is correct

### R022 — When the plugin is disabled or Obsidian closes, polling stops cleanly
- Class: constraint
- Status: validated
- Description: When the plugin is disabled or Obsidian closes, polling stops cleanly
- Why it matters: Prevents resource leaks
- Source: inferred
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: validated
- Notes: Proven by onunload tests + activePollers cleanup

### R023 — No file writes between callout insertion and response/error terminal state. The markdown source stays as a single header line while the request is pending.
- Class: core-capability
- Status: validated
- Description: No file writes between callout insertion and response/error terminal state. The markdown source stays as a single header line while the request is pending.
- Why it matters: Eliminates the race condition with Claude Code's Edit tool (issue #6). Claude Code can freely edit the active note while a question is pending.
- Source: user
- Primary owning slice: M006/S01
- Supporting slices: M006/S02
- Validation: Contract-verified: suggest.test.ts "no replaceCalloutBlock called between insertion and terminal state" proves zero file writes during pending. All old timer-write code removed (buildThinkingBody, lastDisplayUpdate). Dead code grep returns 0. 117 tests pass, build clean.
- Notes: M006 complete. All timer-write code, auto-retry code, and warning state removed. File is truly static during pending.

### R025 — The user's question is always the callout title. Status information (timer, error, response) lives in the callout body. The title stays constant through the entire lifecycle.
- Class: primary-user-loop
- Status: validated
- Description: The user's question is always the callout title. Status information (timer, error, response) lives in the callout body. The title stays constant through the entire lifecycle.
- Why it matters: Mirrors the response callout where the prompt is already the title. More coherent visual flow from thinking to done.
- Source: user
- Primary owning slice: M006/S01
- Supporting slices: M006/S02
- Validation: Contract-verified: callout.test.ts "buildCalloutHeader produces single-line prompt-as-title" verifies format. buildErrorCallout also uses query-as-title. retryRequest replaces error callout with buildCalloutHeader(query, newRid) preserving the title. 41 callout tests pass.
- Notes: D015 implemented. Title stays constant through lifecycle. Body is DOM-only during pending, file-written at terminal state.

### R028 — Timeout and connection errors both use an orange color scheme. No red.
- Class: primary-user-loop
- Status: validated
- Description: Timeout and connection errors both use an orange color scheme. No red.
- Why it matters: User feedback: "red is too much." Three emotional registers total: gray (waiting), orange (problem), green (done).
- Source: user
- Primary owning slice: M006/S01
- Supporting slices: M007/S01
- Validation: Validated in Obsidian: [!claude-error] callout type with --callout-color: 220, 150, 50 and alert-triangle icon. No red in styles.css.
- Notes: M007 changed approach from .claude-error CSS class (post-processor) to dedicated [!claude-error] callout type (pure CSS). Works without DOM manipulation.

### R029 — There is no amber warning state at 2 minutes. The timer alone communicates elapsed time. The callout goes directly from gray (thinking) to orange (error) or green (done).
- Class: constraint
- Status: validated
- Description: There is no amber warning state at 2 minutes. The timer alone communicates elapsed time. The callout goes directly from gray (thinking) to orange (error) or green (done).
- Why it matters: With the timer ticking every second, the user can see how long it's been. The warning was telling them something they already know.
- Source: collaborative
- Primary owning slice: M006/S01
- Supporting slices: none
- Validation: Contract-verified: No warning state logic exists in suggest.ts or callout.ts — buildWarningBody removed, no amber state transitions. Timeout goes directly to error state (orange). Dead code grep confirms zero references to warning state code. 117 tests pass.
- Notes: Simplifies the state machine. Supersedes M005 warning behavior.

### R030 — After callout insertion, the cursor is placed on the line after a blank line below the callout. The user can immediately continue writing without pressing Enter to escape the blockquote.
- Class: primary-user-loop
- Status: validated
- Description: After callout insertion, the cursor is placed on the line after a blank line below the callout. The user can immediately continue writing without pressing Enter to escape the blockquote.
- Why it matters: Currently the cursor stays inside the blockquote — the user must press Enter twice. This is a friction point reported by the user.
- Source: user
- Primary owning slice: M006/S01
- Supporting slices: none
- Validation: Contract-verified: suggest.test.ts "cursor placed on line after blank line below callout" + "insertion includes callout header + blank line" prove cursor placement at insertLine+2. 36 suggest tests pass.
- Notes: Insert text is: callout header + \n + \n. setCursor to {line: insertLine+2, ch: 0}.

## Deferred

### R013 — Dropdown shows preset prompts like "Expand this", "Challenge this" in addition to freeform
- Class: differentiator
- Status: deferred
- Description: Dropdown shows preset prompts like "Expand this", "Challenge this" in addition to freeform
- Why it matters: Speeds up common interactions
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred per user decision — freeform only for now

### R014 — Claude has access to linked notes and backlinks for richer context
- Class: differentiator
- Status: deferred
- Description: Claude has access to linked notes and backlinks for richer context
- Why it matters: Would let Claude understand the broader knowledge graph
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Stretch goal — may need its own milestone

### R015 — Plugin processes Claude's response to render rich markdown beyond native callout support
- Class: differentiator
- Status: deferred
- Description: Plugin processes Claude's response to render rich markdown beyond native callout support
- Why it matters: Would improve display of code blocks, tables, etc.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Starting with raw text per user decision

### R027 — When a request times out, the error callout includes a Retry button. Clicking it re-sends the original question and resets the callout to thinking state. No auto-retry.
- Class: core-capability
- Status: deferred
- Description: When a request times out, the error callout includes a Retry button. Clicking it re-sends the original question and resets the callout to thinking state. No auto-retry.
- Why it matters: Auto-retry sends without user consent — user may have moved on or asked again differently. Manual retry gives user control.
- Source: collaborative
- Primary owning slice: none
- Supporting slices: none
- Validation: INVALID — Retry button depends on ErrorRenderChild (post-processor) which doesn't work in Obsidian.
- Notes: D020 (M007): Deferred. Retry concept is sound but needs a non-post-processor implementation (e.g., command palette action, or user just types ;; again).

### R031 — When the user clicks Retry, the original question is re-sent to the channel server (not a "please respond" proxy message). The callout resets to thinking state with a fresh timer and a subtle "(retry)" hint.
- Class: core-capability
- Status: deferred
- Description: When the user clicks Retry, the original question is re-sent to the channel server (not a "please respond" proxy message). The callout resets to thinking state with a fresh timer and a subtle "(retry)" hint.
- Why it matters: The old RETRY_PROMPT leaked implementation into user-visible text. Re-sending the original question is cleaner.
- Source: collaborative
- Primary owning slice: none
- Supporting slices: none
- Validation: INVALID — Depends on post-processor for Retry button and retry hint rendering.
- Notes: D020 (M007): Deferred along with R027. The principle (re-send original query, no proxy message) is correct and should be preserved if retry is reimplemented.

### R032 — User can cancel a pending question before the response arrives, stopping the poll loop and replacing the callout with a "Cancelled" state.
- Class: core-capability
- Status: deferred
- Description: User can cancel a pending question before the response arrives, stopping the poll loop and replacing the callout with a "Cancelled" state.
- Why it matters: Once a question is sent, the user is committed to waiting through the full timeout cycle. No escape hatch.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: User explicitly deferred this to a later milestone during M006 discussion.

## Out of Scope

### R016 — Plugin does not call the Anthropic API directly — all communication goes through Claude Code channels
- Class: anti-feature
- Status: out-of-scope
- Description: Plugin does not call the Anthropic API directly — all communication goes through Claude Code channels
- Why it matters: Prevents scope confusion. The channel approach is deliberate.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Core architectural decision

### R024 — The pulsing dot and elapsed timer are rendered in the DOM via registerMarkdownPostProcessor + MarkdownRenderChild, not written to the file.
- Class: core-capability
- Status: out-of-scope
- Description: The pulsing dot and elapsed timer are rendered in the DOM via registerMarkdownPostProcessor + MarkdownRenderChild, not written to the file.
- Why it matters: This was the mechanism that enabled R023. DOM-only rendering means the file content doesn't change, but the user still sees a live timer.
- Source: collaborative
- Primary owning slice: M006/S01
- Supporting slices: none
- Validation: INVALID — Obsidian strips HTML comments from rendered DOM. Post-processor fires but rid regex never matches. ThinkingRenderChild never runs in practice.
- Notes: D020 (M007): Remove entirely. CSS spinner animation on [!claude] callouts provides sufficient thinking-state feedback without DOM manipulation.

### R026 — The only visual indicators during pending state are a pulsing dot in the callout title (DOM-only) and elapsed time text in the body (DOM-only). No spinner icon, no timer icon, no "Thinking…" label in the title.
- Class: primary-user-loop
- Status: out-of-scope
- Description: The only visual indicators during pending state are a pulsing dot in the callout title (DOM-only) and elapsed time text in the body (DOM-only). No spinner icon, no timer icon, no "Thinking…" label in the title.
- Why it matters: User feedback: "too many indicators." Minimal approach is appropriate for a writing tool.
- Source: user
- Primary owning slice: M006/S01
- Supporting slices: none
- Validation: INVALID — Depends on post-processor which doesn't work. Replaced by CSS spinner animation on [!claude] callout icon.
- Notes: D020 (M007): Superseded. Thinking state indicator is now CSS-only: rotating loader icon on [!claude] callouts. No DOM manipulation.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | primary-user-loop | validated | M001/S01 | none | validated |
| R002 | primary-user-loop | validated | M001/S01 | none | validated |
| R003 | core-capability | validated | M001/S03 | M001/S01, M001/S02 | validated |
| R004 | primary-user-loop | validated | M001/S01 | M001/S03 | validated |
| R005 | core-capability | validated | M001/S02 | none | validated |
| R006 | core-capability | validated | M001/S02 | none | validated |
| R007 | primary-user-loop | validated | M001/S03 | M001/S01, M001/S02 | validated |
| R008 | primary-user-loop | validated | M001/S03 | none | validated |
| R009 | failure-visibility | validated | M001/S03 | none | validated |
| R010 | core-capability | validated | M001/S01 | none | validated |
| R011 | core-capability | validated | M001/S03 | none | validated |
| R012 | continuity | validated | M001/S03 | none | validated |
| R013 | differentiator | deferred | none | none | unmapped |
| R014 | differentiator | deferred | none | none | unmapped |
| R015 | differentiator | deferred | none | none | unmapped |
| R016 | anti-feature | out-of-scope | none | none | n/a |
| R017 | constraint | validated | M003/S01 | none | validated |
| R018 | constraint | validated | M003/S01 | none | validated |
| R019 | core-capability | validated | M003/S02 | none | validated — 69 plugin tests pass (vitest), build clean (esbuild) as of M007 completion. Test count reduced from 117 to 69 after removing 48 dead tests covering deleted post-processor code. |
| R020 | continuity | validated | M003/S01 | none | validated |
| R021 | continuity | validated | M003/S01 | none | validated |
| R022 | constraint | validated | M001/S03 | none | validated |
| R023 | core-capability | validated | M006/S01 | M006/S02 | Contract-verified: suggest.test.ts "no replaceCalloutBlock called between insertion and terminal state" proves zero file writes during pending. All old timer-write code removed (buildThinkingBody, lastDisplayUpdate). Dead code grep returns 0. 117 tests pass, build clean. |
| R024 | core-capability | out-of-scope | M006/S01 | none | INVALID — Obsidian strips HTML comments from rendered DOM. Post-processor fires but rid regex never matches. ThinkingRenderChild never runs in practice. |
| R025 | primary-user-loop | validated | M006/S01 | M006/S02 | Contract-verified: callout.test.ts "buildCalloutHeader produces single-line prompt-as-title" verifies format. buildErrorCallout also uses query-as-title. retryRequest replaces error callout with buildCalloutHeader(query, newRid) preserving the title. 41 callout tests pass. |
| R026 | primary-user-loop | out-of-scope | M006/S01 | none | INVALID — Depends on post-processor which doesn't work. Replaced by CSS spinner animation on [!claude] callout icon. |
| R027 | core-capability | deferred | none | none | INVALID — Retry button depends on ErrorRenderChild (post-processor) which doesn't work in Obsidian. |
| R028 | primary-user-loop | validated | M006/S01 | M007/S01 | Validated in Obsidian: [!claude-error] callout type with --callout-color: 220, 150, 50 and alert-triangle icon. No red in styles.css. |
| R029 | constraint | validated | M006/S01 | none | Contract-verified: No warning state logic exists in suggest.ts or callout.ts — buildWarningBody removed, no amber state transitions. Timeout goes directly to error state (orange). Dead code grep confirms zero references to warning state code. 117 tests pass. |
| R030 | primary-user-loop | validated | M006/S01 | none | Contract-verified: suggest.test.ts "cursor placed on line after blank line below callout" + "insertion includes callout header + blank line" prove cursor placement at insertLine+2. 36 suggest tests pass. |
| R031 | core-capability | deferred | none | none | INVALID — Depends on post-processor for Retry button and retry hint rendering. |
| R032 | core-capability | deferred | none | none | unmapped |

## Coverage Summary

- Active requirements: 0
- Mapped to slices: 0
- Validated: 23 (R001, R002, R003, R004, R005, R006, R007, R008, R009, R010, R011, R012, R017, R018, R019, R020, R021, R022, R023, R025, R028, R029, R030)
- Unmapped active requirements: 0
