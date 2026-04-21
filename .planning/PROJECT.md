# Obsidian Claude Chat

## What This Is

An Obsidian plugin that lets you chat with Claude inline while writing. Type `;;` anywhere in a note, a dropdown appears, type your question, hit Enter — Claude's response appears as a `> [!claude]` callout block in your document. Two components: a lightweight Obsidian plugin (~200 lines) using `EditorSuggest` for the trigger/dropdown, and a Claude Code channel server (~80 lines) that bridges the plugin to Claude Code via MCP channels. Includes one-click setup: auto-generates `.mcp.json`, `CLAUDE.md`, downloads `channel.js`, and provides a Start button in settings.

## Core Value

Type `;;` in any note → ask Claude a question → get a response as a native callout block without leaving your writing surface. Claude Code reads your actual files, sees prior conversation blocks, and has full filesystem/git/MCP access.

## Current State

M001–M007 complete. The plugin is at version 0.1.7. M007 removed the broken post-processor DOM rendering system and all dependent code — 1,700 net lines deleted. The plugin uses CSS-only spinner animation on `[!claude]` callouts for pending state, and markdown-only error callouts. No DOM rendering, no state map, no retry machinery. 69 tests pass across 5 files, build clean. Released on GitHub as 0.1.7.

The project has a standalone git repo in `obsidian-claude-chat/` with clean history.

## Architecture / Key Patterns

- **Callout matching:** Proximity-based search via `findCalloutRange()` — scans backward from cursor position for `> [!claude]` markers. No embedded IDs. Server's `request_id` used only for `pollReply` API calls. Internal `pollerId` (UUID) used solely for poller tracking.
- **Obsidian Plugin (TypeScript):** Extends `EditorSuggest<T>` for `;;` trigger. POSTs prompt + metadata (filename, cursor line) to channel server. Polls channel for reply. Inserts/replaces `> [!claude]` callout blocks. One-click setup auto-generates configs.
- **Channel Server (TypeScript/Bun):** MCP server declaring `claude/channel` capability. HTTP endpoint receives plugin POSTs, emits `notifications/claude/channel` events. Exposes `reply` tool for Claude Code to send responses back. Stores replies for plugin polling.
- **Communication:** Plugin → POST → Channel → MCP notification → Claude Code → reply tool → Channel stores response → Plugin polls → inserts in document.
- **Context model:** Plugin sends filename + cursor position only. Claude Code reads the file itself. Prior `[!claude]` blocks serve as conversation history.
- **Pending state UI:** CSS spinner animation on `[!claude]` callout icon. File stays static during pending state — only one write at terminal state (response/error). Error state uses `[!claude-error]` callout type with orange scheme. No DOM rendering, no state map, no retry button.
- **Runtime deps:** `@modelcontextprotocol/sdk`, Bun, Claude Code v2.1.80+, Obsidian plugin API.

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Current Milestone: v0.2.0 Install Hygiene & Channel-Instruction Consolidation

**Goal:** Stop polluting vault-root CLAUDE.md with channel rules, and give users explicit consent and clean removal for the one remaining vault write (`.mcp.json`).

**Target features:**
- Consolidate channel instructions into MCP `instructions` (issue #10): move 5 unique rules from `.obsidian/plugins/inline-claude/CLAUDE.md` into `channel/server.ts`'s `instructions: [...]` array; remove the `@` import from vault-root CLAUDE.md; migrate existing installs to clean up the injected line
- Install UX (issue #12, depends on #10): first-run consent notice before writing `.mcp.json`; "Remove vault configuration" button that surgically removes only the `inline-claude` entry from `mcpServers`; README section documenting every file the plugin writes
- `ensureSetup()` no longer mutates `<vault>/CLAUDE.md` or `<vault>/.obsidian/plugins/inline-claude/CLAUDE.md`

## Milestone Sequence

- [x] M001: Inline Claude Chat MVP — Trigger, channel, and end-to-end callout insertion
- [x] M003: Repo Structure Fix — Move plugin source into project directory with own git repo
- [x] M004: Bug Fixes — Request-ID callout matching, Bun detection, live settings status
- [x] M005: Long-Running Response Handling — Heartbeat + elapsed time + auto-retry
- [x] M006: DOM-Only Timer & Callout Redesign — Fix race condition, post-processor rendering, manual retry
- [x] M007: Post-Processor Removal & Code Cleanup — Strip dead code, release (v0.1.7)
- [ ] v0.2.0: Install Hygiene & Channel-Instruction Consolidation — Consent UX + single source of truth for channel rules

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-04-21 — Milestone v0.2.0 started*
