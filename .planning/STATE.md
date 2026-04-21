# Project State

## Project Reference

See: .planning/PROJECT.md

**Current focus:** Milestone v0.2.0 (defining requirements)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-21 — Milestone v0.2.0 started

## Accumulated Context

### Decisions

Migrated from GSD-2. Review PROJECT.md for key decisions.

v0.2.0 scope is driven by dogfooding friction in the `Bawa's Lab` vault:
- `@.obsidian/plugins/inline-claude/CLAUDE.md` import triggers the external-import security prompt when Claude Code runs from a subfolder of the vault
- Channel rules leak into every session under the vault, even those unrelated to the inline-claude channel
- MCP `instructions` capability is the correct channel-scoped location — loaded only when the MCP server is connected
- `.mcp.json` remains the only required vault write; consent + explicit removal close the UX gap

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-21
Stopped at: Milestone v0.2.0 initialization (requirements pending)
Resume file: None
