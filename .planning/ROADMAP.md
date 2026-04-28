# Roadmap

## M001: Inline Claude Chat MVP

- [x] **Phase 01: plugin-scaffold-editorsuggest-trigger** — Plugin scaffold + EditorSuggest trigger
- [x] **Phase 02: channel-server-with-reply-tool** — Channel server with reply tool
- [x] **Phase 03: end-to-end-wiring-error-handling** — End-to-end wiring + error handling

## M003: Repo Structure Fix

- [x] **Phase 04: move-files-git-init** — Move files + git init
- [x] **Phase 05: verify-vault-cleanup** — Verify + vault cleanup

## M004: Bug Fixes - Callout Matching, Error Messages, Settings Status

- [x] **Phase 06: request-id-callout-matching** — Request-ID callout matching
- [x] **Phase 07: bun-detection-settings-live-status** — Bun detection + settings live status

## M005: Long-Running Response Handling - Heartbeat + Elapsed Time + Auto-Retry

- [x] **Phase 08: live-elapsed-time-warning-in-callout** — Live Elapsed Time + Warning in Callout
- [x] **Phase 09: auto-retry-at-timeout-settings-update** — Auto-Retry at Timeout + Settings Update

## M006: DOM-Only Timer & Callout Redesign

- [x] **Phase 10: dom-only-timer-rendering-callout-redesign** — DOM-only timer rendering & callout redesign
- [x] **Phase 11: error-states-manual-retry-cleanup** — Error states, manual retry & cleanup

## M007: Post-Processor Removal & Code Cleanup

- [x] **Phase 12: strip-dead-code-simplify** — Strip dead code & simplify
- [x] **Phase 13: release** — Release

## M008: v0.2.0 — Install Hygiene & Channel Scoping

- [ ] **Phase 14: channel-instructions-consolidation** — Move channel rules into MCP `instructions` capability; one-shot migration to strip `@.obsidian/plugins/inline-claude/CLAUDE.md` include from existing vaults' root `CLAUDE.md` (#10)
- [ ] **Phase 15: install-hygiene-consent-and-removal** — Consent notice on first write, removal button that also kills orphan bun on configured port, document vault-touching writes (#12)
- [ ] **Phase 16: canvas-reply-via-canvas-api** — Reply-back path for `.canvas` files: route through `app.workspace.getLeavesOfType('canvas')` → `view.canvas.nodes` → `node.setText()` → `canvas.requestSave()`. Fallback to JSON patch when canvas leaf is closed. Round-trip a node ID at trigger time for reliable reply matching. Fixes #14 via #15. Keeps markdown path untouched.
