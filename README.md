# Inline Claude

Talk to Claude Code directly inside your Obsidian notes. Type `;;`, write your question, press Enter — the response appears as a callout block right where you're writing.

No sidebar. No separate window. The conversation stays in your vault, exactly where it's relevant.

## ⚠️ Read This First

This plugin gives Claude Code access to your vault and filesystem. You should understand exactly what that means before installing.

**What happens when you ask a question:**

1. The plugin sends your question + the current filename and line number to a local channel server (HTTP on localhost)
2. The channel server forwards it to Claude Code over MCP (stdin/stdout)
3. Claude Code reads your file, processes context, and generates a response
4. The response comes back through the same chain and appears as a callout block

**What Claude Code can do:**

- Read any file on your filesystem (not just your vault)
- Write and modify files
- Execute shell commands (if you start with `--dangerously-skip-permissions`)
- Access any MCP servers you have configured

**What the plugin itself does:**

- Sends your typed query to localhost
- Polls for a response
- Writes the response as a callout block in your note
- The plugin never composes, modifies, or injects instructions into your query — it sends exactly what you typed, nothing more

**What the plugin does NOT do:**

- No telemetry, no analytics, no external network calls (all communication is localhost)
- No background processing — every interaction is user-initiated via the `;;` trigger
- No prompt engineering on your behalf — the plugin is a transparent pipe between you and Claude Code

> **If you wouldn't run Claude Code in a directory, don't use this plugin in that directory.**

## Why

Most AI integrations put the conversation somewhere else — a sidebar, a separate app, a chat window. You write in one place and talk to AI in another.

Inline Claude keeps everything in the note. You're writing, you have a question, you type `;;` and ask. The answer appears below your cursor. Previous Q&A blocks stay in the document as context, so the note itself becomes the conversation.

## How it works

1. Type `;;` anywhere in a note
2. A dropdown appears — write your question and press Enter
3. A `> [!claude] Thinking...` callout appears with a live timer
4. Claude Code reads your file, sees the surrounding context, and responds
5. The callout becomes a collapsible `> [!claude-done]+` block with the answer

If a response times out, you'll see an error callout with a **Retry** button. Retry re-sends your exact original query — nothing is added or modified.

Claude sees previous callout blocks in your note, so follow-up questions work naturally.

## What you can do with it

Because Claude Code runs as the backend, it has full access to your vault and filesystem. This means you're not limited to Q&A:

- **Create and link notes** — ask Claude to make a note and link it where you are
- **Read and modify files** — Claude can check plugin configs, edit settings, search your vault
- **Use MCP servers** — anything connected to Claude Code (Are.na, databases, APIs) is available inline
- **Modify the plugin itself** — since the source is in your vault, Claude can update callout styles, fix bugs, or add features on the fly

## Security Model

**Trust boundary:** The plugin trusts that you control what runs on localhost. All communication happens over `http://localhost:{port}`. No data leaves your machine unless Claude Code itself makes external calls (e.g., Anthropic API, MCP servers you've configured).

**The plugin is a transparent pipe.** It sends your query verbatim. It does not:
- Prepend system prompts or instructions
- Append context, metadata, or hidden instructions
- Modify the response before rendering
- Retry with different/augmented queries

**Prompt injection surface:** The plugin does not compose prompts, so it cannot be used as a prompt injection vector. The retry mechanism re-sends the original query exactly. If you see a response that seems wrong, it came from Claude Code, not from the plugin manipulating the prompt.

**Filesystem access:** Claude Code (not the plugin) has filesystem access. The plugin itself only reads/writes callout blocks in the current note. However, the channel server and Claude Code run with your user permissions. Starting Claude Code with `--dangerously-skip-permissions` means it can read, write, and execute without asking.

**What could go wrong:**
- If someone gains access to localhost on the channel port, they can send queries to Claude Code as you
- If you start with `--dangerously-skip-permissions`, Claude Code can execute arbitrary commands without confirmation
- The `CLAUDE.md` file in your vault shapes Claude's behavior — a malicious file there could influence responses
- Callout blocks from previous conversations are visible to Claude as context — sensitive content in old callouts will be sent to Claude when you ask new questions in the same note

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

- **Start (safe mode)** — Claude asks for permission before running tools. This is the recommended mode.
- **Start (auto-approve)** — Uses `--dangerously-skip-permissions`. Claude won't ask before reading, writing, or running commands. A confirmation dialog will appear before launching. **Understand what this means before accepting.**

Both open a terminal window. Keep it running — Claude Code is now listening for your questions.

Or start manually:

```bash
cd /path/to/your/vault
claude --dangerously-load-development-channels server:inline-claude
```

Add `--dangerously-skip-permissions` only if you understand that Claude Code will execute without asking.

### 4. Type `;;` in any note

That's it. Ask away.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Trigger phrase | `;;` | Text that opens the question dropdown |
| Channel port | `4321` | Port the channel server listens on. Use a different port per vault. |
| Response timeout | `300` | Max seconds to wait for a response before showing an error with a Retry button |

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

All communication is localhost. The plugin talks to the channel server over HTTP. The channel server talks to Claude Code over MCP via stdio. Claude Code receives questions as channel events and responds using the `reply` tool.

## Multiple vaults

Each vault needs its own channel port. Change the port in the plugin settings — the `.mcp.json` updates automatically.

## License

MIT — see [LICENSE](LICENSE).

## Support

If you find this useful, [buy me a coffee](https://ko-fi.com/bawakul).
