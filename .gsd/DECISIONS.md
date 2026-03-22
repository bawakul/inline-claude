# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001/S02 planning | architecture | Where to place the channel server code relative to the Obsidian plugin | Separate `channel/` subdirectory with its own `package.json`, independent of the Obsidian plugin's build pipeline | The channel server is a standalone Bun process spawned by Claude Code, not bundled into the Obsidian plugin's `main.js`. It has different runtime requirements (Bun, @modelcontextprotocol/sdk, stdio transport) and different build needs (no esbuild, no obsidian externals). Keeping it in a separate package avoids dependency conflicts and makes the boundary explicit. The two components communicate only via HTTP. | Yes |
| D002 | M001/S02 planning | library | Which MCP SDK class to use for the channel server | Low-level `Server` class from `@modelcontextprotocol/sdk/server/index.js`, not the high-level `McpServer` wrapper | The `experimental['claude/channel']` capability is only available on the low-level `Server` constructor. The high-level `McpServer` wrapper doesn't expose experimental capabilities. All official channel reference implementations (fakechat, etc.) use `Server`. This is not a choice — it's a constraint of the current API. | Yes |
