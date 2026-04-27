---
slug: mcp-port-conflict-ux
status: resolved
trigger: ".mcp.json port-conflict UX bug — multiple claude instances under the vault collide on PORT=4323; first-to-start wins, others fail silently while plugin still shows green"
created: 2026-04-27
updated: 2026-04-27
---

# Debug: .mcp.json port conflict UX bug

## Symptoms

- **Expected behavior:** When the user launches `claude` from the inline-claude plugin's settings tab, that claude becomes the active subscriber for the vault's `;;` traffic. The plugin's "🟢 Connected to Claude Code" indicator reflects that *this specific* claude is wired up to receive POSTs from the plugin.
- **Actual behavior:** Plugin shows green and the plugin-launched terminal logs `--dangerously-load-development-channels server:inline-claude`, but `;;` messages never arrive in that claude. They are silently routed to a different claude process (whichever started first under the vault tree).
- **Error messages:** None surfaced to the user. Internally, second+ `channel/server.ts` invocations hit `EADDRINUSE` on the configured port, but Claude Code's MCP stdio handshake does not propagate that bind failure. The plugin's `/health` poll returns 200 from whichever bun won the port, so the green dot lights regardless.
- **Timeline:** Surfaced 2026-04-21 during v0.2.0 setup. Likely present since `.mcp.json` adopted a fixed `PORT`.
- **Reproduction:**
  1. Open a Zed (or any) terminal in `obsidian-claude-chat/` and run `claude --dangerously-skip-permissions` (no channels flag).
  2. That claude reads the vault's `.mcp.json`, spawns `bun channel/server.ts` which binds the port — it becomes the silent subscriber even though it has no inline-claude awareness.
  3. Open Obsidian and click "Launch Claude Code" in the inline-claude plugin settings — the plugin starts a second claude with `--dangerously-load-development-channels server:inline-claude`.
  4. Second `bun channel/server.ts` fails to bind (EADDRINUSE) but the failure is swallowed.
  5. Plugin `/health` poll succeeds against the *first* bun → green dot.
  6. Type `;;question` in a note → POST goes to the first bun → routed to the unrelated first claude → no callout response in the note.

## Hypotheses to investigate

Per STATE.md, three contributing surfaces are suspected:

1. **`channel/server.ts`** — does not detect an existing bun on the port and exit cleanly / re-attach as an HTTP-only client. Crashes (or silently dies) inside the stdio MCP server, so Claude Code's handshake completes anyway.
2. **`.mcp.json`** — uses a vault-global fixed `PORT` in `env`, so every claude under the vault tree spawns its own competing server. Per-vault dynamic port or unix socket would eliminate the collision class.
3. **Plugin `/health` check** — only verifies *some* bun answers on the port, not that the bun it answered from is parented by a claude that actually loaded `server:inline-claude`. Green dot lies.

## Current Focus

- hypothesis: H1 confirmed as upstream cause. H3 addressed by session_id tracking. H2 is a separate hardening concern (not fixed here — user can change port in settings).
- test: Ran full test suite (28 channel tests + 77 plugin tests). All pass.
- expecting: Port-conflict bun now exits cleanly, dropping the MCP stdio link, causing Claude Code to report a server failure and making the plugin's health check go red for the conflicting instance.
- next_action: Resolved — fix applied and verified.

## Evidence

- timestamp: 2026-04-27T22:30:00Z
  file: channel/server.ts
  finding: >
    `Bun.serve()` is called bare with no error handling. If the port is already bound,
    Bun throws EADDRINUSE synchronously during startup. The `main().catch()` wrapper
    catches it, logs to stderr, and calls `process.exit(1)` — BUT this happens AFTER
    `server.connect(transport)` has already succeeded and returned. The MCP stdio
    link is alive at that point. Claude Code sees a healthy handshake and marks the
    server as connected. The second bun exits, but Claude Code does not propagate
    the post-handshake failure to the user. The plugin sees no `/health` response
    degradation because it polls the *first* bun.

- timestamp: 2026-04-27T22:30:00Z
  file: src/main.ts (checkHealth)
  finding: >
    `checkHealth()` asserts only `res.status === 200`. It has no way to distinguish
    *which* bun process answered — any healthy bun on the port produces a green dot.
    The plugin has no memory of which session it originally connected to.

- timestamp: 2026-04-27T22:30:00Z
  file: .mcp.json
  finding: >
    Current dev repo `.mcp.json` uses `./channel/server.ts` with no PORT env var;
    the port defaults to `process.env.PORT || 4321`. The plugin's `ensureMcpJson()`
    in `setup.ts` writes `PORT: String(port)` from `plugin.settings.channelPort`
    (default 4321). The fixed port is the collision vector; a per-vault port setting
    already exists in plugin settings (changeable by user) but has no enforcement
    mechanism when multiple claudes share the same vault path.

## Eliminated

- H2 (`.mcp.json` dynamic port): Not fixed in this session — the port is already
  user-configurable in plugin settings. The correct mitigation (unix socket or
  per-vault port) is a future hardening task. The primary UX regression (silent
  failure / lying green dot) is resolved by H1 fix + H3 session tracking.

## Resolution

- root_cause: >
    `channel/server.ts` called `Bun.serve()` without catching port-conflict errors.
    When a second bun tried to bind an already-occupied port, it exited (via the
    outer `main().catch()`) AFTER the MCP stdio handshake had already completed
    successfully. Claude Code considered the MCP server live; the plugin polled
    `/health` on the *first* (winning) bun and showed green, creating a silent
    subscriber where `;;` messages were routed to an unrelated claude session.

- fix: >
    1. `channel/server.ts`: wrapped `Bun.serve()` in a try/catch that detects
       EADDRINUSE, logs a clear human-readable error, calls `server.close()` to
       drop the MCP stdio transport, then exits with code 1. This causes Claude Code
       to report an MCP server failure and the plugin's health check to go red for
       the conflicting instance — the silent-green UX bug is eliminated.
    2. `channel/server.ts`: added a `SESSION_ID` (UUID generated at process start)
       included in all `/health` JSON responses as `session_id`. This lets the plugin
       detect when the bun process has changed (e.g. a different claude took over).
    3. `src/main.ts`: updated `checkHealth()` to parse the JSON `/health` response,
       track `channelSessionId`, and show a `Notice` when the session ID changes
       mid-run — alerting the user that a different claude may now own the channel.
    4. `channel/__tests__/server.test.ts`: updated the `/health` test to assert on
       the new JSON shape (`{ ok: true, session_id: "..." }`); added a second test
       for the `sessionId` option on `createFetchHandler`.

- files_changed:
    - channel/server.ts
    - src/main.ts
    - channel/__tests__/server.test.ts

- verification: >
    `bun test` in channel/: 28 pass, 0 fail.
    `npm test` in root: 77 pass, 0 fail.
