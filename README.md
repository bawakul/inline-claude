# Inline Claude

Chat with Claude inline in your Obsidian notes — type `;;` and get responses as native callout blocks.

But it's not just Q&A. Because [Claude Code](https://docs.anthropic.com/en/docs/claude-code) is the backend, everything it can do is available from inside your note: create and link files, search your vault, talk to MCP servers (Are.na, Notion, APIs...), generate diagrams, even modify the plugin itself while you're using it.

No sidebar. No chat window. No context-switching.

https://github.com/user-attachments/assets/95815cf3-e0f0-42ce-906b-decce4a11598

> [!WARNING]
> This plugin gives Claude Code access to your vault and filesystem. Please read the [Security & trust model](#%EF%B8%8F-security--trust-model) section before installing.

## The idea

Most AI tools put you in the passenger seat. You leave your work, open a chat, explain what you're doing, get an answer, copy it back. The AI drives. You're along for the ride.

Inline Claude flips that. You're writing — your thoughts, your notes, your flow — and Claude is just *there* when you need it. You stay in the driver's seat. The AI fits into your environment, not the other way around.

And because the plugin is open and simple, you can reshape it while you're using it. Ask Claude to change callout colours, add features, fix bugs — from inside the note you're working in. That's [malleable software](https://www.geoffreylitt.com/2023/03/25/llm-end-user-programming.html) — the tool changes shape to fit you, not the other way around.

## How it works

1. Type `;;` anywhere in a note
2. Write your question in the dropdown and press Enter
3. A callout appears with a spinner while Claude thinks
4. Claude reads your file, sees the surrounding context, and responds
5. The callout turns green with the answer, collapsible so it stays out of your way

Follow-up questions work naturally — Claude sees previous Q&A blocks as context. The note itself becomes the conversation.

### Architecture

```
You (Obsidian) → Plugin → Channel Server (localhost) → Claude Code → back
```

Everything stays on your machine. The plugin talks to a local channel server over HTTP, which forwards to Claude Code over MCP. No cloud relay, no external calls (unless Claude Code itself makes them, e.g. the Anthropic API).

## What you can do with it

Because Claude Code is the backend, you're not limited to Q&A:

- **Read and write your vault** — create notes, search across files, link things together
- **Use your MCP servers** — anything connected to Claude Code (Are.na, Notion, databases, APIs) is available inline
- **Modify the plugin itself** — the source is in your vault, Claude can update styles, fix bugs, add features on the fly
- **Generate rich content** — Mermaid diagrams, slide decks, structured reports, all inline

## ⚠️ Security & trust model

**Be honest with yourself about what this is.** This plugin gives Claude Code access to your vault and filesystem. You should understand exactly what that means.

**The plugin is a transparent pipe.** It sends your query verbatim to Claude Code and renders the response. It does not inject system prompts, append hidden instructions, or modify anything in transit.

**What Claude Code can do:**
- Read any file on your filesystem (not just your vault)
- Write and modify files
- Execute shell commands (if started with `--dangerously-skip-permissions`)
- Access any MCP servers you have configured

**What the plugin does NOT do:**
- No telemetry, no analytics, no external network calls
- No background processing — every interaction is user-initiated
- No hidden instructions — the only prompt shaping is the [CLAUDE.md](https://github.com/bawakul/inline-claude/blob/main/src/setup.ts#L7-L28) you can read and modify

**What could go wrong:**
- A note containing malicious instructions (from a web clipper, shared vault, or imported content) could influence Claude's behaviour when you ask questions in that note
- The `CLAUDE.md` file shapes Claude's behaviour — a tampered file could alter responses
- Starting with `--dangerously-skip-permissions` means Claude executes without asking
- If someone gains access to the channel port on localhost, they can send queries as you

**Prompt injection is a real risk.** Any text that enters your vault — web clips, imports, shared notes — could contain instructions that Claude follows. This is not unique to this plugin (it's inherent to LLMs reading untrusted text), but the combination of inline access + filesystem permissions makes the surface area worth understanding.

> [!IMPORTANT]
> **On channel plugins generally:** Claude Code Channels are in research preview, and plugins like this one are going to become more common as the feature matures. If you're evaluating any plugin that bridges an app to Claude Code, review it thoroughly — read the source, understand what permissions it requests, and check what it sends over the channel. Don't install channel-based plugins you haven't inspected.

**This plugin was vibe-coded** — I'm not a developer by trade. The code works, but it may not be structured the way an experienced developer would do it. Feedback and contributions are welcome.

> **If you wouldn't run Claude Code in a directory, don't use this plugin in that directory.**

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
Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/bawakul/inline-claude/releases) into `.obsidian/plugins/inline-claude/`.

### 2. Enable it

Settings → Community plugins → enable **Inline Claude**.

### What the plugin writes to your vault

On first load, the plugin creates three configuration files:

- **`.mcp.json`** — registers the channel server so Claude Code can connect. If you already have an `.mcp.json`, the plugin adds its entry alongside your existing servers.
- **`.obsidian/plugins/inline-claude/CLAUDE.md`** — instructions that tell Claude Code how to handle your questions (always reply, read the file first, be concise). The vault root `CLAUDE.md` gets an `@include` line pointing to this file.
- **`channel.js`** — the channel server script. If missing (common with BRAT installs), the plugin downloads it from the [GitHub release](https://github.com/bawakul/inline-claude/releases) matching your installed version.

**The CLAUDE.md instructions shape how Claude behaves when responding to your questions.** [Read them before installing](https://github.com/bawakul/inline-claude/blob/main/src/setup.ts#L7-L28) — they're defined in `setup.ts` and written verbatim, nothing hidden.

If you already have a `CLAUDE.md` with your own instructions, the plugin appends the include line without overwriting anything.

### 3. Start Claude Code

Open plugin settings → **Start (safe mode)** or **Start (auto-approve)**.

Safe mode asks for permission before Claude runs tools. Auto-approve (`--dangerously-skip-permissions`) does not — a confirmation dialog explains the implications.

Or start manually:

```bash
cd /path/to/your/vault
claude --dangerously-load-development-channels server:inline-claude
```

### 4. Type `;;` in any note

That's it.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Trigger phrase | `;;` | Text that opens the question dropdown |
| Channel port | `4321` | Port for the channel server. Use a different port per vault. |
| Response timeout | `300` | Seconds to wait before showing a timeout error |

## Multiple vaults

Each vault needs its own port. Change it in plugin settings — the `.mcp.json` updates automatically.

## Acknowledgements

- Built with [Claude Code Channels](https://docs.anthropic.com/en/docs/claude-code) (research preview) and [GSD](https://github.com/gsd-build/gsd-2)
- The `;;` trigger UI is inspired by the [Natural Language Dates](https://github.com/argenos/nldates-obsidian) plugin
- The Obsidian theme in the demo video is [Typewriter](https://github.com/crashmoney/obsidian-typewriter)

## License

MIT — see [LICENSE](LICENSE).

## Support

If you find this useful, [buy me a coffee](https://ko-fi.com/bawakul).
