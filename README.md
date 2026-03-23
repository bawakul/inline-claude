# Inline Claude

Ask Claude questions directly inside your Obsidian notes. Type `;;`, write your question, press Enter — the response appears as a callout block right where you're writing.

No sidebar. No separate window. The conversation stays in your document.


https://github.com/user-attachments/assets/02203656-e478-4cef-b4b0-bfb67d27a106


## Why

Most AI integrations put the conversation somewhere else — a sidebar, a separate app, a chat window. You write in one place and talk to AI in another.

Inline Claude keeps everything in the note. You're writing, you have a question, you type `;;` and ask. The answer appears below your cursor. Previous Q&A blocks stay in the document as context, so the note itself becomes the conversation.

The goal is simple: you stay in your flow. Claude is there when you need it.

## How it works

1. Type `;;` anywhere in a note
2. A dropdown appears — write your question and press Enter
3. A `> [!claude] Thinking...` callout appears as a placeholder
4. Claude Code reads your file, sees the surrounding context, and responds
5. The placeholder becomes a collapsible `> [!claude-done]+` callout with the answer

Claude sees previous callout blocks in your note, so follow-up questions work naturally.

## What you can do with it

Because Claude Code runs as the backend, it has full access to your vault and filesystem. This means you're not limited to Q&A:

- **Create and link notes** — ask Claude to make a note and link it where you are
- **Read and modify files** — Claude can check plugin configs, edit settings, search your vault
- **Use MCP servers** — anything connected to Claude Code (Are.na, databases, APIs) is available inline
- **Modify the plugin itself** — since the source is in your vault, Claude can update callout styles, fix bugs, or add features on the fly

Your notes, your tools, your workflow. Claude just fits in where needed.

## Requirements

- [Obsidian](https://obsidian.md/) (desktop only)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) v2.1.80+
- [Bun](https://bun.sh/) runtime (for the channel server)
- A Claude subscription (Pro, Max, or Team)

## Setup

### 1. Install the plugin

**Via BRAT (recommended):**
Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) and add `bawakul/inline-claude` as a beta plugin.

**Manual:**
Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/bawakul/inline-claude/releases) and place them in `.obsidian/plugins/inline-claude/` in your vault.

### 2. Enable the plugin

Settings → Community plugins → enable **Inline Claude**.

The plugin automatically sets up the channel server config (`.mcp.json`) and Claude instructions (`CLAUDE.md`) on first load. If you already have these files, it adds its entries without overwriting your existing config.

### 3. Start Claude Code

Open the plugin settings. You'll see two options:

- **Start (safe mode)** — Claude asks for permission before running tools
- **Start (auto-approve)** — Uses `--dangerously-skip-permissions`. Claude won't ask before reading, writing, or running commands. Faster, but it has full access to your filesystem.

Both open a terminal window where you'll need to confirm once. Keep it running — Claude Code is now listening for your questions.

Or start manually:

```bash
cd /path/to/your/vault
claude --dangerously-load-development-channels server:inline-claude
```

### 4. Type `;;` in any note

That's it. Ask away.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Trigger phrase | `;;` | Text that opens the question dropdown |
| Channel port | `4321` | Port the channel server listens on. Use a different port per vault. |
| Polling timeout | `60` | Max seconds to wait for a response |

## Architecture

```
Obsidian Plugin                Channel Server              Claude Code
     |                              |                          |
     |-- POST /prompt ------------->|                          |
     |   {filename, line, query}    |-- MCP channel event ---->|
     |                              |                          |
     |                              |                          |-- reads file
     |                              |                          |-- processes context
     |                              |                          |
     |                              |<-- reply tool -----------|
     |                              |   {request_id, text}     |
     |<-- GET /poll/:id ------------|                          |
     |   {status, response}         |                          |
     v                              v                          v
  Replaces placeholder
  with response callout
```

The plugin communicates with the channel server over HTTP (localhost). The channel server communicates with Claude Code over MCP via stdio. Claude Code receives questions as channel events and responds using the `reply` tool.

## Multiple vaults

Each vault needs its own channel port. Change the port in the plugin settings — the `.mcp.json` updates automatically.

## License

MIT — see [LICENSE](LICENSE).

## Support

If you find this useful, [buy me a coffee](https://ko-fi.com/bawakul).
