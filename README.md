# Inline Claude

Ask Claude questions directly inside your Obsidian notes. Type `;;`, write your question, press Enter — Claude's response appears as a callout block right where you're writing.

No sidebar. No context switch. The conversation lives in your document.

## How it works

1. Type `;;` anywhere in a note
2. A dropdown appears with your question
3. Press Enter — a `> [!claude] Thinking...` placeholder appears
4. Claude Code reads your file, sees the context, and responds
5. The placeholder is replaced with Claude's answer as a callout block

Previous `> [!claude]` blocks in your note serve as conversation history — Claude sees them when responding.

## What makes this different

Other Obsidian + AI plugins put the conversation in a sidebar panel. Inline Claude keeps it in your document. You never leave the writing surface.

There's no tool layer or custom API wrapper. Claude Code already has full filesystem access, bash, search — everything. This plugin just bridges the gap between "I'm writing in a note" and "I want Claude to see this question."

~150 lines of plugin code. ~100 lines of channel server. That's it.

## Requirements

- [Obsidian](https://obsidian.md/) (desktop)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) v2.1.80+
- [Bun](https://bun.sh/) runtime (for the channel server)
- A Claude subscription (Pro, Max, or Team)

## Setup

### 1. Install the plugin

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/bawakul/obsidian-claude-chat/releases) and place them in your vault's `.obsidian/plugins/inline-claude/` directory.

Or install via [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `bawakul/obsidian-claude-chat` as a beta plugin.

### 2. Set up the channel server

Create a `.mcp.json` file in your vault root:

```json
{
  "mcpServers": {
    "inline-claude": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/channel/server.ts"]
    }
  }
}
```

Replace `/path/to/channel/server.ts` with the actual path to the `channel/server.ts` file from this repository.

### 3. Add a CLAUDE.md to your vault

Create a `CLAUDE.md` file in your vault root with instructions for Claude. See [CLAUDE.md.example](CLAUDE.md.example) for a starting point.

### 4. Start Claude Code

```bash
cd /path/to/your/vault
claude --dangerously-load-development-channels server:inline-claude
```

Keep this terminal open. Claude Code is now listening for your questions.

### 5. Enable the plugin

In Obsidian: Settings → Community plugins → enable **Inline Claude**.

Type `;;` in any note and ask away.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Trigger phrase | `;;` | The text that opens the question dropdown |
| Channel port | `4321` | Port the channel server listens on |
| Polling timeout | `30000` | Max milliseconds to wait for a response |

## How it works (technical)

```
Obsidian Plugin                Channel Server              Claude Code
     |                              |                          |
     |-- POST /prompt ------------->|                          |
     |   {filename, line, query}    |-- MCP notification ----->|
     |                              |   <channel>              |
     |                              |                          |-- reads file
     |                              |                          |-- sees context
     |                              |<-- reply tool -----------|
     |                              |   {request_id, text}     |
     |<-- GET /poll/:id ------------|                          |
     |   {status, response}         |                          |
     |                              |                          |
     v                              v                          v
  Replaces placeholder
  with response callout
```

The plugin and channel server communicate over HTTP. The channel server and Claude Code communicate over MCP (stdio). Claude Code has the `claude/channel` capability, which lets it receive push notifications from the channel server.

## License

MIT — see [LICENSE](LICENSE).

## Support

If you find this useful, consider [sponsoring the project](https://github.com/sponsors/bawakul) or [buying me a coffee](https://ko-fi.com/bawakul).
