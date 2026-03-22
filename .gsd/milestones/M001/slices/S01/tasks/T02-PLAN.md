---
estimated_steps: 6
estimated_files: 8
skills_used:
  - best-practices
  - test
  - lint
---

# T02: Implement EditorSuggest freeform trigger, callout insertion, settings tab, and unit tests

**Slice:** S01 — Plugin scaffold + EditorSuggest trigger
**Milestone:** M001

## Description

Implement the full S01 feature set: an `EditorSuggest<string>` subclass that triggers on `;;` (configurable), captures freeform text as a single suggestion, and on selection replaces the trigger text with a `> [!claude] Thinking...` callout block. Add a settings tab for configuring the trigger phrase. Write unit tests for all pure logic (callout text building, trigger detection) using vitest with mocked Obsidian types.

This task delivers R001 (trigger opens dropdown), R002 (freeform text as suggestion), R004 (callout insertion on select), and R010 (configurable trigger phrase).

## Steps

1. **Create `vitest.config.ts`** at project root. Configure vitest to handle TypeScript, and set up path aliases matching `tsconfig.json`. The `obsidian` module must be mocked/externalized since it's not a real npm package — create a `src/__mocks__/obsidian.ts` file that exports mock classes (`Plugin`, `Editor`, `EditorSuggest`, `PluginSettingTab`, `Setting`, `App`, `EditorPosition`, `EditorSuggestTriggerInfo`, `TFile`) with minimal no-op implementations sufficient for unit testing.

2. **Create `src/callout.ts`** with two exports:
   - `buildCalloutText(content: string): string` — pure function that takes content string and returns the full callout block text: `> [!claude] Thinking...\n> {content}`. Multi-line content gets each line prefixed with `> `. This is the testable pure logic.
   - `insertCallout(editor: Editor, from: EditorPosition, to: EditorPosition, content: string): void` — calls `editor.replaceRange(buildCalloutText(content), from, to)` to insert the callout, replacing the trigger text range. Uses Obsidian's `Editor` API.

3. **Create `src/settings.ts`** with:
   - `interface ClaudeChatSettings { triggerPhrase: string; }` with `DEFAULT_SETTINGS: ClaudeChatSettings = { triggerPhrase: ";;" }`
   - `class ClaudeChatSettingTab extends PluginSettingTab` — `display()` creates a `Setting` with text input for `triggerPhrase`, label "Trigger phrase", description "Type this to open the Claude chat dropdown".
   - Settings load via `plugin.loadData()` merging with defaults, save via `plugin.saveData()`.

4. **Create `src/suggest.ts`** with `ClaudeSuggest extends EditorSuggest<string>`:
   - `onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null)`:
     - Get line text: `editor.getLine(cursor.line)`
     - Get text up to cursor: `lineText.substring(0, cursor.ch)`
     - Find last occurrence of `this.plugin.settings.triggerPhrase` in the text before cursor
     - If not found → return `null` immediately (critical: must not block other EditorSuggest)
     - Extract query: everything after the trigger phrase up to cursor
     - Return `{ start: { line: cursor.line, ch: triggerIndex }, end: cursor, query }`
   - `getSuggestions(context: EditorSuggestContext)`:
     - If `context.query.trim() === ""` → return `[]` (no empty suggestions)
     - Return `[context.query]` — single freeform suggestion
   - `renderSuggestion(value: string, el: HTMLElement)`:
     - `el.setText("Ask Claude: " + value)`
   - `selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent)`:
     - Get `this.context` (EditorSuggestContext with `editor`, `start`, `end`, `file`)
     - Calculate the range to replace: from trigger start to the end of cursor
     - Call `insertCallout(editor, from, to, value)` to replace `;;query` with the callout block
     - Store `{ filename: file.path, line: start.line, query: value }` on `this.plugin.lastQuery` for S03 to consume later

5. **Update `src/main.ts`** to wire everything:
   - Import `ClaudeSuggest`, `ClaudeChatSettings`, `DEFAULT_SETTINGS`, `ClaudeChatSettingTab`
   - Add `settings: ClaudeChatSettings` and `lastQuery: { filename: string; line: number; query: string } | null` properties
   - `onload()`: load settings with `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`, register suggest with `this.registerEditorSuggest(new ClaudeSuggest(this))`, add settings tab with `this.addSettingTab(new ClaudeChatSettingTab(this.app, this))`
   - `saveSettings()` async method that calls `await this.saveData(this.settings)`

6. **Write unit tests:**
   - `src/__tests__/callout.test.ts`:
     - `buildCalloutText("hello")` returns `"> [!claude] Thinking...\n> hello"`
     - `buildCalloutText("line1\nline2")` returns multi-line callout with each line prefixed
     - `buildCalloutText("")` returns just the header `"> [!claude] Thinking..."`
   - `src/__tests__/suggest.test.ts`:
     - Test trigger detection: extract trigger index and query from various line texts
     - Export a `findTrigger(lineText: string, cursorCh: number, triggerPhrase: string)` helper from `suggest.ts` to make the pure logic testable
     - `findTrigger(";;hello", 7, ";;")` returns `{ triggerIndex: 0, query: "hello" }`
     - `findTrigger("some text ;;question", 20, ";;")` returns `{ triggerIndex: 10, query: "question" }`
     - `findTrigger("no trigger here", 15, ";;")` returns `null`
     - `findTrigger(";;", 2, ";;")` returns `{ triggerIndex: 0, query: "" }` (empty query)
     - `findTrigger("text ??question", 15, "??")` returns the correct trigger for custom phrases

7. **Rebuild and run tests:** `npm run build && npx vitest run`

## Must-Haves

- [ ] `ClaudeSuggest.onTrigger()` returns `null` when trigger phrase is not on the current line (non-blocking)
- [ ] `ClaudeSuggest.onTrigger()` correctly detects `;;` (or configured trigger) anywhere on the line
- [ ] `ClaudeSuggest.getSuggestions()` returns `[]` for empty query and `[query]` for non-empty
- [ ] `ClaudeSuggest.renderSuggestion()` displays "Ask Claude: {text}"
- [ ] `ClaudeSuggest.selectSuggestion()` replaces trigger text with callout block via `insertCallout`
- [ ] `buildCalloutText()` correctly formats single-line and multi-line content
- [ ] Settings tab allows changing the trigger phrase with immediate effect
- [ ] `findTrigger()` pure function is exported and unit-tested
- [ ] All unit tests pass via `npx vitest run`
- [ ] `npm run build` still exits 0 after all changes

## Verification

- `npm run build` exits 0 — TypeScript compiles, esbuild bundles
- `npx vitest run` — all tests in `src/__tests__/` pass
- `grep -q "EditorSuggest" src/suggest.ts` — EditorSuggest subclass exists
- `grep -q "onTrigger" src/suggest.ts` — trigger method implemented
- `grep -q "buildCalloutText" src/callout.ts` — callout helper exported
- `grep -q "triggerPhrase" src/settings.ts` — settings interface has trigger field

## Inputs

- `package.json` — from T01, has vitest and obsidian dependencies
- `tsconfig.json` — from T01, TypeScript configuration
- `esbuild.config.mjs` — from T01, build configuration
- `src/main.ts` — from T01, minimal plugin entry point to extend

## Expected Output

- `src/suggest.ts` — EditorSuggest subclass with freeform trigger pattern
- `src/callout.ts` — callout text builder and editor insertion helper
- `src/settings.ts` — settings interface, defaults, and settings tab
- `src/main.ts` — updated with settings, suggest registration, and settings tab wiring
- `src/__tests__/callout.test.ts` — unit tests for callout text building
- `src/__tests__/suggest.test.ts` — unit tests for trigger detection logic
- `src/__mocks__/obsidian.ts` — mock Obsidian module for unit testing
- `vitest.config.ts` — vitest configuration
