import type ClaudeChatPlugin from "./main";
import { requestUrl, Notice } from "obsidian";
import * as path from "path";
import * as fs from "fs";

const CLAUDE_MD_INSTRUCTIONS = `# Inline Claude — Channel Instructions

You are connected to an Obsidian vault via the inline-claude channel.

## How this works

- The user types \`;;question\` inside an Obsidian note
- The question arrives as a \`<channel source="inline-claude">\` event with the user's question and file context (filename, line number)
- You respond by calling the \`reply\` tool with the \`request_id\` from the event meta and your response text
- Your response appears inline in the user's note as a callout block

## Instructions

- **Always reply.** Every channel event expects a response via the \`reply\` tool.
- **Read the file first.** The event meta includes \`filename\` and \`line\`. Read that file to understand the context — what the user is writing about, what's around the cursor, and any prior \`> [!claude]\` callout blocks (those are previous Q&A exchanges).
- **Be concise but complete.** Your response appears inline in a note. Write clear, direct answers. Use markdown formatting — it renders natively in Obsidian.
- **Always start with a text line.** Never begin your response with a table, code block, or other block-level markdown. Start with a short text sentence first — the response is prefixed with "Claude:" on the first line, which breaks block-level elements.
- **Match the tone.** If the user is writing casually, be casual. If they're writing an essay, be more polished.
- **No follow-up questions.** Provide a complete answer in a single reply. The user can ask again if they need more.
- **You have full filesystem access.** You can read other files in the vault, run commands, search — use whatever context you need to give a good answer.
`;

const INCLUDE_LINE = "@.obsidian/plugins/inline-claude/CLAUDE.md";

/**
 * Ensure all required config files are in place.
 * Called once on plugin load. Non-destructive — only writes files that don't exist
 * or adds the include line if missing.
 */
export async function ensureSetup(plugin: ClaudeChatPlugin): Promise<void> {
	const vaultPath = getVaultPath(plugin);
	if (!vaultPath) {
		console.log("Inline Claude: could not determine vault path, skipping auto-setup");
		return;
	}

	await ensureChannelJs(plugin, vaultPath);
	await ensureChannelClaudeMd(plugin);
	await ensureMcpJson(vaultPath, plugin);
	await ensureRootClaudeMd(vaultPath);
}

const REPO = "bawakul/inline-claude";

/**
 * Ensure channel.js exists in the plugin folder.
 * BRAT only downloads main.js, manifest.json, and styles.css.
 * If channel.js is missing, download it from the GitHub release matching the current version.
 */
async function ensureChannelJs(plugin: ClaudeChatPlugin, vaultPath: string): Promise<void> {
	const channelJsPath = path.join(
		vaultPath,
		".obsidian",
		"plugins",
		"inline-claude",
		"channel.js"
	);

	if (fs.existsSync(channelJsPath)) {
		return; // Already present (manual install or previous download)
	}

	const version = plugin.manifest.version;
	const url = `https://github.com/${REPO}/releases/download/${version}/channel.js`;

	console.log(`Inline Claude: channel.js not found, downloading from ${url}`);
	new Notice("Inline Claude: downloading channel server...");

	try {
		const res = await requestUrl({ url, throw: false });
		if (res.status === 200) {
			fs.writeFileSync(channelJsPath, res.text);
			console.log("Inline Claude: channel.js downloaded successfully");
			new Notice("Inline Claude: channel server ready.");
		} else {
			console.log(`Inline Claude: failed to download channel.js (HTTP ${res.status})`);
			new Notice("Inline Claude: could not download channel server. You may need to add channel.js manually.");
		}
	} catch (err) {
		console.log(`Inline Claude: failed to download channel.js: ${err}`);
		new Notice("Inline Claude: could not download channel server. Check your internet connection.");
	}
}

function getVaultPath(plugin: ClaudeChatPlugin): string | null {
	// Obsidian's vault adapter gives us the base path on desktop
	const adapter = plugin.app.vault.adapter;
	if ("getBasePath" in adapter && typeof adapter.getBasePath === "function") {
		return adapter.getBasePath();
	}
	return null;
}

/**
 * Write the channel instructions CLAUDE.md inside the plugin folder.
 * This is the file that gets @included.
 */
async function ensureChannelClaudeMd(plugin: ClaudeChatPlugin): Promise<void> {
	const pluginDir = plugin.manifest.dir;
	if (!pluginDir) return;

	const claudeMdPath = path.join(pluginDir, "CLAUDE.md");
	
	// Use vault adapter to check/write within the vault
	const adapter = plugin.app.vault.adapter;
	const exists = await adapter.exists(claudeMdPath);
	if (!exists) {
		await adapter.write(claudeMdPath, CLAUDE_MD_INSTRUCTIONS);
		console.log("Inline Claude: wrote channel CLAUDE.md in plugin folder");
	}
}

/**
 * Ensure .mcp.json exists in the vault root with the inline-claude server entry.
 * If the file exists, merges our entry without overwriting other servers.
 */
async function ensureMcpJson(vaultPath: string, plugin: ClaudeChatPlugin): Promise<void> {
	const mcpPath = path.join(vaultPath, ".mcp.json");
	const channelJsPath = path.join(
		vaultPath,
		".obsidian",
		"plugins",
		"inline-claude",
		"channel.js"
	);

	const ourEntry = {
		type: "stdio",
		command: "bun",
		args: ["run", channelJsPath],
	};

	try {
		if (fs.existsSync(mcpPath)) {
			const existing = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
			if (existing?.mcpServers?.["inline-claude"]) {
				// Already configured — update the path in case it changed
				existing.mcpServers["inline-claude"] = ourEntry;
			} else {
				// Add our entry alongside existing servers
				existing.mcpServers = existing.mcpServers || {};
				existing.mcpServers["inline-claude"] = ourEntry;
			}
			fs.writeFileSync(mcpPath, JSON.stringify(existing, null, 2) + "\n");
			console.log("Inline Claude: updated .mcp.json with inline-claude entry");
		} else {
			const config = { mcpServers: { "inline-claude": ourEntry } };
			fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n");
			console.log("Inline Claude: created .mcp.json");
		}
	} catch (err) {
		console.log(`Inline Claude: failed to write .mcp.json: ${err}`);
	}
}

/**
 * Ensure the vault root CLAUDE.md includes our channel instructions.
 * If no CLAUDE.md exists, creates one with just the include.
 * If one exists, appends the include line if not already present.
 */
async function ensureRootClaudeMd(vaultPath: string): Promise<void> {
	const claudeMdPath = path.join(vaultPath, "CLAUDE.md");

	try {
		if (fs.existsSync(claudeMdPath)) {
			const content = fs.readFileSync(claudeMdPath, "utf-8");
			if (!content.includes(INCLUDE_LINE)) {
				fs.writeFileSync(claudeMdPath, content.trimEnd() + "\n\n" + INCLUDE_LINE + "\n");
				console.log("Inline Claude: added include line to existing CLAUDE.md");
			}
		} else {
			fs.writeFileSync(claudeMdPath, INCLUDE_LINE + "\n");
			console.log("Inline Claude: created CLAUDE.md with include line");
		}
	} catch (err) {
		console.log(`Inline Claude: failed to write CLAUDE.md: ${err}`);
	}
}
