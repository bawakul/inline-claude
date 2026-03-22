---
estimated_steps: 5
estimated_files: 6
skills_used:
  - best-practices
  - lint
---

# T01: Scaffold Obsidian plugin build toolchain with minimal entry point

**Slice:** S01 — Plugin scaffold + EditorSuggest trigger
**Milestone:** M001

## Description

Create the complete Obsidian plugin build toolchain from scratch: `package.json` with dependencies, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, empty `styles.css`, and a minimal `src/main.ts` that exports a `Plugin` subclass. This follows the official `obsidian-sample-plugin` pattern exactly. The goal is a green build (`npm run build` produces `main.js`) so T02 can focus purely on feature implementation.

## Steps

1. Create `manifest.json` with `id: "obsidian-claude-chat"`, `name: "Claude Chat"`, `version: "0.1.0"`, `minAppVersion: "1.0.0"`, `isDesktopOnly: true`, `author` and `description` fields.

2. Create `package.json` with:
   - `"name": "obsidian-claude-chat"`, `"version": "0.1.0"`, `"main": "main.js"`
   - `dependencies`: `"obsidian": "latest"` (used only for types, externalized at build)
   - `devDependencies`: `"@types/node": "^22"`, `"esbuild": "^0.25"`, `"typescript": "~5.7"`, `"tslib": "^2.8"`, `"builtin-modules": "^4.0"`, `"vitest": "^3.0"`
   - `scripts`: `"build": "node esbuild.config.mjs production"`, `"dev": "node esbuild.config.mjs"`, `"test": "vitest run"`

3. Create `tsconfig.json` with `target: "ES6"`, `module: "ESNext"`, `moduleResolution: "node"`, `baseUrl: "src"`, `outDir: "./dist"`, `strictNullChecks: true`, `noImplicitAny: true`, `include: ["src/**/*.ts"]`, `exclude: ["node_modules"]`. Types include `"node"`.

4. Create `esbuild.config.mjs` — copy the pattern from `obsidian-sample-plugin`:
   - Entry: `src/main.ts`, outfile: `main.js`
   - External: `obsidian`, `electron`, all `@codemirror/*`, all `@lezer/*`, plus Node builtins from `builtin-modules`
   - Format: `cjs`, target: `es2018`, platform: `node`
   - Production mode when `process.argv[2] === "production"` (minify, no sourcemap), dev mode otherwise (watch, sourcemap inline)

5. Create `styles.css` as an empty file (required by Obsidian plugin loader).

6. Create `src/main.ts` with a minimal `ClaudeChatPlugin extends Plugin` class:
   ```typescript
   import { Plugin } from "obsidian";
   export default class ClaudeChatPlugin extends Plugin {
     async onload() { console.log("Claude Chat plugin loaded"); }
     onunload() { console.log("Claude Chat plugin unloaded"); }
   }
   ```

7. Run `npm install` and `npm run build`. Verify `main.js` exists and is loadable.

## Must-Haves

- [ ] `manifest.json` is valid JSON with correct `id`, `name`, `version`, `minAppVersion`, `isDesktopOnly`
- [ ] `package.json` lists `obsidian` as dependency and `esbuild`, `typescript`, `vitest` as devDependencies
- [ ] `esbuild.config.mjs` externalizes `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, and Node builtins
- [ ] `tsconfig.json` targets ES6 with strict null checks and includes `src/**/*.ts`
- [ ] `src/main.ts` exports a default class extending `Plugin` with `onload` and `onunload`
- [ ] `npm run build` exits 0 and produces `main.js` in the project root
- [ ] `styles.css` exists (empty file, required by Obsidian)

## Verification

- `npm run build` exits 0
- `test -f main.js` — output file exists
- `node -e "require('./main.js')"` — module loads without error
- `test -f manifest.json && node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"` — valid JSON
- `test -f styles.css` — empty stylesheet exists

## Inputs

- `manifest.json` — does not exist yet, will be created
- `package.json` — does not exist yet, will be created

## Expected Output

- `package.json` — npm project with all dependencies declared
- `tsconfig.json` — TypeScript configuration
- `esbuild.config.mjs` — build script following obsidian-sample-plugin pattern
- `manifest.json` — Obsidian plugin manifest
- `styles.css` — empty stylesheet (Obsidian requirement)
- `src/main.ts` — minimal plugin entry point extending `Plugin`
- `main.js` — compiled output (build artifact)
