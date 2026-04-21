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

### Follow-up: port-conflict UX bug (surfaced 2026-04-21 during v0.2.0 setup)

Symptom: plugin settings tab shows "🟢 Connected to Claude Code" and a plugin-launched terminal reports `--dangerously-load-development-channels server:inline-claude` loaded, but `;;` messages never reach that claude.

Root cause: `.mcp.json` registers `channel.js` as a stdio MCP server with a fixed `PORT=4323` in `env`. Any claude started anywhere under the vault tree reads the same `.mcp.json` and tries to spawn its own bun on 4323. First claude to start wins the port. Subsequent claudes get `EADDRINUSE` inside channel.js — but:
- Claude Code's MCP handshake does not surface that bind failure (it only verifies the stdio link is up)
- The plugin's `/health` poll succeeds against whichever bun did win the port, so the green dot lights up even though the *user's* claude isn't the subscriber
- Plugin POSTs end up being piped to whatever claude got there first — which may be an unrelated session that doesn't even have the channels flag

Real-world trigger in this session: Zed terminal in `obsidian-claude-chat/` was launched first (plain `claude --dangerously-skip-permissions`). It picked up the vault's `.mcp.json`, spawned bun on 4323, and became the silent subscriber. The plugin-launched claude started second, failed to bind, and is deaf.

Not scoped into v0.2.0 (P14 consolidates instructions, P15 adds consent/removal) — but a 3rd phase candidate. Potential fixes:
- channel.js should detect existing bun on the port and exit cleanly (or attach as HTTP-only client), not crash/EADDRINUSE silently
- `.mcp.json` could use a per-vault dynamic port (e.g. `${OBSIDIAN_VAULT_ID}`) or a unix socket
- Plugin "Connected" status should verify the bound bun's parent PID matches *a* `server:inline-claude` claude, not just `/health` 200

Action: capture as backlog item once v0.2.0 ships. Keep in mind while designing P15's removal UX — the cleanup path should also kill orphan bun processes, not just edit `.mcp.json`.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-21
Stopped at: Milestone v0.2.0 initialization (requirements pending)
Resume file: None
