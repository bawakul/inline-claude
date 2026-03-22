---
estimated_steps: 4
estimated_files: 4
skills_used:
  - test
---

# T01: Scaffold channel project with request store and unit tests

**Slice:** S02 — Channel server with reply tool
**Milestone:** M001

## Description

Create the `channel/` subdirectory as a standalone Bun TypeScript project, separate from the Obsidian plugin. Implement the pure request store (`store.ts`) that both the HTTP endpoints and MCP reply tool will use, and write comprehensive unit tests proving its behavior. The store is a `Map`-based in-memory data structure with auto-expiry.

This is the foundation — every other piece in S02 depends on the store, and the project scaffold (package.json, tsconfig) enables everything that follows.

## Steps

1. Create `channel/package.json` with:
   - `name: "obsidian-chat-channel"`, `version: "0.1.0"`, `type: "module"`
   - Dependencies: `@modelcontextprotocol/sdk` (latest)
   - DevDependencies: `vitest`, `typescript`, `@types/bun`
   - Scripts: `"test": "vitest run"`, `"start": "bun run server.ts"`
2. Create `channel/tsconfig.json` targeting ES2022, module ESNext, moduleResolution bundler, strict mode, Bun types. Include `**/*.ts`, exclude `node_modules`.
3. Implement `channel/store.ts`:
   - Type: `RequestEntry = { request_id: string, filename: string, line: number, query: string, status: "pending" | "complete", response?: string, created: number, timer: ReturnType<typeof setTimeout> }`
   - `createRequest(filename: string, line: number, query: string): { request_id: string }` — generates UUID via `crypto.randomUUID()`, stores entry with 5-minute TTL `setTimeout` that deletes the entry, returns `{ request_id }`
   - `storeReply(request_id: string, text: string): boolean` — finds entry, if pending sets status to "complete" + response, returns true. If not found or already complete, returns false.
   - `getStatus(request_id: string): { status: string, response?: string, filename?: string, line?: number, query?: string } | null` — returns entry data or null if not found
   - `getRequestMeta(request_id: string): { filename: string, line: number, query: string } | null` — returns just the file context (needed for notification payload construction)
   - Export a `clearAll(): void` for test cleanup
   - **Constraint:** Use `console.error` for any logging, never `console.log` (stdout is reserved for MCP JSON-RPC in the server process)
4. Write `channel/__tests__/store.test.ts` with vitest:
   - `createRequest` returns object with `request_id` string (UUID format)
   - `getStatus` after create returns `{status: "pending", filename, line, query}`
   - `storeReply` with valid id returns true, `getStatus` then returns `{status: "complete", response: "..."}`
   - `storeReply` with unknown id returns false
   - `storeReply` on already-complete request returns false (no double-reply)
   - `getStatus` with unknown id returns null
   - TTL expiry: use `vi.useFakeTimers()`, advance 5 minutes + 1ms, confirm `getStatus` returns null
   - `clearAll` removes all entries
   - `getRequestMeta` returns `{filename, line, query}` for valid id, null for unknown

## Must-Haves

- [ ] `channel/package.json` exists with correct deps and scripts
- [ ] `channel/tsconfig.json` compiles without errors
- [ ] `store.ts` exports `createRequest`, `storeReply`, `getStatus`, `getRequestMeta`, `clearAll`
- [ ] All store unit tests pass
- [ ] `bun install` in `channel/` succeeds

## Verification

- `cd channel && bun install && bun test` — all tests pass
- `cd channel && npx tsc --noEmit` — no type errors

## Inputs

- `package.json` — reference for project naming conventions
- `vitest.config.ts` — reference for vitest configuration pattern (S01 established this)
- `src/__tests__/suggest.test.ts` — reference for test style conventions

## Expected Output

- `channel/package.json` — Bun project manifest with MCP SDK dependency
- `channel/tsconfig.json` — TypeScript config for channel subdirectory
- `channel/store.ts` — Pure request store with CRUD + TTL
- `channel/__tests__/store.test.ts` — Unit tests for store
