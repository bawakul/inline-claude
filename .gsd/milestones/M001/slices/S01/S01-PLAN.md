# S01: Plugin scaffold + EditorSuggest trigger

**Goal:** Deliver a buildable Obsidian plugin that triggers an EditorSuggest dropdown on `;;`, captures freeform text, inserts a `> [!claude] Thinking...` callout placeholder, and provides a settings tab for configuring the trigger phrase.
**Demo:** Type `;;hello world` in any Obsidian note → dropdown appears showing "Ask Claude: hello world" → select it → `;;hello world` is replaced with a `> [!claude] Thinking...\n> hello world` callout block. Settings tab lets you change `;;` to any other trigger phrase.

## Must-Haves

- `;;` (or configured trigger) anywhere on a line opens an EditorSuggest dropdown (R001)
- The dropdown shows the user's freeform text after the trigger as a single suggestion item (R002)
- Selecting the suggestion replaces the trigger text with a `> [!claude] Thinking...` callout block (R004)
- The trigger phrase is configurable in a plugin settings tab (R010)
- `onTrigger` returns `null` immediately when trigger is absent (no blocking other EditorSuggest instances)
- Empty query (just `;;` with nothing after) shows no suggestions
- Plugin builds with `npm run build` producing `main.js` in project root

## Proof Level

- This slice proves: contract (EditorSuggest freeform pattern works, callout insertion works, boundary API shapes are correct for S03)
- Real runtime required: yes (full proof requires Obsidian, but build + unit tests prove contract)
- Human/UAT required: yes (manual Obsidian testing for dropdown behavior — documented in verification)

## Verification

- `npm run build` exits 0 and produces `main.js` at project root
- `npx vitest run` passes all unit tests in `src/__tests__/`
- `test -f main.js && test -f manifest.json && test -f styles.css` — all plugin artifacts exist
- `node -e "const m = require('./main.js'); console.log(typeof m.default)"` — plugin module exports correctly
- Manual: Copy `main.js`, `manifest.json`, `styles.css` into `.obsidian/plugins/obsidian-claude-chat/`, enable plugin, type `;;test` → dropdown appears

## Observability / Diagnostics

- Runtime signals: `console.log` on plugin load/unload (standard Obsidian pattern)
- Inspection surfaces: Obsidian Developer Console (Ctrl+Shift+I) shows plugin load messages and any errors
- Failure visibility: TypeScript compile errors surface at build time; runtime errors appear in Obsidian console
- Redaction constraints: none (no secrets or PII in this slice)

## Integration Closure

- Upstream surfaces consumed: none (first slice, greenfield)
- New wiring introduced in this slice: `ClaudeChatPlugin` registers `ClaudeSuggest` via `this.registerEditorSuggest()`, settings tab via `this.addSettingTab()`
- What remains before the milestone is truly usable end-to-end: S02 (channel server), S03 (wiring plugin to channel + error handling + polling)

## Tasks

- [ ] **T01: Scaffold Obsidian plugin build toolchain with minimal entry point** `est:30m`
  - Why: All subsequent work depends on a working build pipeline. Need `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, and a minimal `src/main.ts` that compiles.
  - Files: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, `styles.css`, `src/main.ts`
  - Do: Create all config files following the `obsidian-sample-plugin` pattern exactly. `obsidian` and all `@codemirror/*`/`@lezer/*` packages must be externalized in esbuild. Entry point is `src/main.ts` exporting a `Plugin` subclass with no-op `onload`/`onunload`. Add `vitest` as dev dependency for unit testing in T02. Run `npm install` and `npm run build`.
  - Verify: `npm run build && test -f main.js && node -e "require('./main.js')"`
  - Done when: `npm run build` exits 0, `main.js` exists in project root, and the module is loadable without errors

- [ ] **T02: Implement EditorSuggest freeform trigger, callout insertion, settings tab, and unit tests** `est:1h`
  - Why: This is the core of S01 — the EditorSuggest freeform pattern (R001, R002), callout insertion (R004), and configurable trigger (R010). Unit tests prove the pure logic without requiring Obsidian runtime.
  - Files: `src/suggest.ts`, `src/callout.ts`, `src/settings.ts`, `src/main.ts`, `src/__tests__/callout.test.ts`, `src/__tests__/suggest.test.ts`, `vitest.config.ts`
  - Do: (1) Create `src/callout.ts` with `insertCallout(editor, line, content)` and `buildCalloutText(content)` helpers. (2) Create `src/suggest.ts` with `ClaudeSuggest extends EditorSuggest<string>` implementing `onTrigger`, `getSuggestions`, `renderSuggestion`, `selectSuggestion`. (3) Create `src/settings.ts` with `ClaudeChatSettings` interface and `ClaudeChatSettingTab`. (4) Wire everything into `src/main.ts`. (5) Write unit tests for `buildCalloutText` and trigger detection logic. (6) Add vitest config that externalizes `obsidian`.
  - Verify: `npm run build && npx vitest run`
  - Done when: Build succeeds, all unit tests pass, and the four source modules are correctly wired together

## Files Likely Touched

- `package.json`
- `tsconfig.json`
- `esbuild.config.mjs`
- `manifest.json`
- `styles.css`
- `src/main.ts`
- `src/suggest.ts`
- `src/callout.ts`
- `src/settings.ts`
- `src/__tests__/callout.test.ts`
- `src/__tests__/suggest.test.ts`
- `vitest.config.ts`
