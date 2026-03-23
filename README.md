# Inline Claude

Ask Claude questions directly inside your Obsidian notes. Type `;;`, write your question, press Enter — Claude's response appears as a callout block right where you're writing.

No sidebar. No context switch. The conversation lives in your document.

## The idea

Chat interfaces put you in Claude's car. You give instructions and sit there. That's nice sometimes — but it's restrictive.

Inline Claude puts Claude in *your* car. You're driving. Claude has the sat-nav. You're doing your thing — writing, thinking, organizing — and once in a while, you ask Claude for something. That's the vibe.

## How it works

1. Type `;;` anywhere in a note
2. A dropdown appears with your question
3. Press Enter — a `> [!claude] Thinking...` placeholder appears
4. Claude Code reads your file, sees the context, and responds
5. The placeholder is replaced with Claude's answer as a collapsible `> [!claude-done]+` callout

Previous callout blocks in your note serve as conversation history — Claude sees them when responding. The note itself becomes the conversation.

## What makes this different

Other Obsidian + AI plugins put the conversation in a sidebar panel. Inline Claude keeps it in your document. You never leave the writing surface.

There's no tool layer or custom API wrapper. Claude Code already has full filesystem access, bash, search — everything. This plugin just bridges the gap between "I'm writing in a note" and "I want Claude to see this question."

~150 lines of plugin code. ~100 lines of channel server. That's it.

## It's more than Q&A

When I started testing, I realised I was onto something bigger than asking Claude questions.

**Malleable software.** Because Claude Code is the backend, it has full access to the vault — and to the plugin itself. That means you can:

- Ask Claude to **change the plugin's own UI** — callout format, colors, animations — and see the change by toggling the plugin. No build step, no deploy.
- Ask Claude to **create notes and link them** right where you are
- Ask Claude to **check what plugins are installed**, read their configs, even interact with them
- Call **MCP servers** inline — fetch your Are.na blocks, query a database, whatever you've got connected
- **Fix bugs live** — find a bug, ask Claude to fix it, toggle the plugin, keep going

I iterated on the plugin's callout design, added green color for completed replies, and added an animated loading spinner — all by asking Claude from inside the note. I was debugging and shipping a plugin *from inside the thing it powers*.

This is what I mean by AI as a "jig" — a tool that helps you make things, not a tool that makes things for you. You're still driving.

### Things you can see in the note

- **Conversation history is right there** — no need to make session notes later, it's already written
- **You can tell who wrote what** — your writing is markdown, Claude's responses are callout blocks
- **The timeline is preserved** — unlike switching between two windows, the note tells the whole story in order

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

### 3. Add Claude instructions

The plugin needs Claude Code to know how to handle channel events.

**If you don't have a `CLAUDE.md` in your vault:**

Copy `CLAUDE.md.example` from this repo to your vault root and rename it to `CLAUDE.md`.

**If you already have a `CLAUDE.md`:**

Add this line anywhere in your existing file:

```
@.obsidian/plugins/inline-claude/CLAUDE.md
```

Then copy `CLAUDE.md.example` from this repo to `.obsidian/plugins/inline-claude/CLAUDE.md`.

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
