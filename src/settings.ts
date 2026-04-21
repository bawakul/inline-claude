import { App, Modal, PluginSettingTab, Setting, Notice } from "obsidian";
import type ClaudeChatPlugin from "./main";
import { spawn, execSync } from "child_process";
import * as path from "path";
import { findBunBinary, CLAUDE_MD_INSTRUCTIONS } from "./setup";

export interface ClaudeChatSettings {
	triggerPhrase: string;
	channelPort: number;
	pollingTimeoutSecs: number;
}

export const DEFAULT_SETTINGS: ClaudeChatSettings = {
	triggerPhrase: ";;",
	channelPort: 4321,
	pollingTimeoutSecs: 300,
};

/**
 * POSIX single-quote escape: wrap in `'...'` and replace each embedded `'` with `'\''`.
 * Safe for any string, including paths with apostrophes, spaces, `$`, backticks, backslashes.
 */
export function shEscape(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Try to find the claude binary. Checks common install locations.
 */
function findClaudeBinary(): string | null {
	const candidates = [
		"claude", // on PATH
	];

	// Try each candidate
	for (const candidate of candidates) {
		try {
			const resolved = execSync(`which ${candidate}`, { encoding: "utf-8" }).trim();
			if (resolved) return resolved;
		} catch {
			// not found, try next
		}
	}

	// Check common install paths directly
	const homedir = process.env.HOME || process.env.USERPROFILE || "";
	const directPaths = [
		path.join(homedir, ".local", "bin", "claude"),
		path.join(homedir, ".claude", "bin", "claude"),
		"/usr/local/bin/claude",
		"/opt/homebrew/bin/claude",
	];

	for (const p of directPaths) {
		try {
			const fs = require("fs");
			if (fs.existsSync(p)) return p;
		} catch {
			// skip
		}
	}

	return null;
}

/**
 * Confirmation modal shown before launching Claude Code with --dangerously-skip-permissions.
 * Forces the user to acknowledge what auto-approve means before proceeding.
 */
export class AutoApproveConfirmModal extends Modal {
	private onConfirm: () => void;

	constructor(app: App, onConfirm: () => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Auto-approve mode" });

		contentEl.createEl("p", {
			text: "This starts Claude Code with --dangerously-skip-permissions. That means:",
		});

		const list = contentEl.createEl("ul");
		list.createEl("li", {
			text: "Claude can read and write any file on your filesystem — not just your vault",
		});
		list.createEl("li", {
			text: "Claude can execute shell commands without asking",
		});
		list.createEl("li", {
			text: "Claude can install packages, modify system files, and make network requests",
		});
		list.createEl("li", {
			text: "None of these actions will require your confirmation",
		});

		contentEl.createEl("p", {
			text: "Before proceeding, review the files that shape Claude's behaviour in your vault:",
		});

		const reviewList = contentEl.createEl("ul");
		reviewList.createEl("li", {
			text: "CLAUDE.md — your vault root instructions (may include the plugin's @include line)",
		});
		reviewList.createEl("li", {
			text: ".obsidian/plugins/inline-claude/CLAUDE.md — the plugin's channel instructions",
		});

		contentEl.createEl("p", {
			text: "Safe mode is recommended unless you have a specific reason to skip permissions.",
			cls: "mod-warning",
		});

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = buttonContainer.createEl("button", {
			text: "I understand, start auto-approve",
			cls: "mod-warning",
		});
		confirmBtn.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class ClaudeChatSettingTab extends PluginSettingTab {
	plugin: ClaudeChatPlugin;
	private statusEl: HTMLElement | null = null;

	constructor(app: App, plugin: ClaudeChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- Connection Status ---
		this.statusEl = containerEl.createEl("div", { cls: "inline-claude-status" });
		this.renderStatus(this.statusEl);

		// Register health change callback for live status updates
		this.plugin.onHealthChange = () => {
			if (this.statusEl) this.renderStatus(this.statusEl);
		};

		// --- Start Claude Code ---
		new Setting(containerEl)
			.setName("Start Claude Code")
			.setDesc(
				"Opens a terminal and launches Claude Code with the channel server connected. Claude will ask for permission before running tools. You'll need to confirm in the terminal."
			)
			.addButton((btn) =>
				btn
					.setButtonText("Start (safe mode)")
					.setCta()
					.onClick(() => {
						this.startClaudeCode(false);
					})
			);

		new Setting(containerEl)
			.setName("Start Claude Code (auto-approve)")
			.setDesc(
				"Starts Claude Code with --dangerously-skip-permissions — Claude will not ask before reading, writing, or running commands. Faster, but it has full access to your filesystem."
			)
			.addButton((btn) =>
				btn
					.setButtonText("Start (auto-approve)")
					.onClick(() => {
						new AutoApproveConfirmModal(this.app, () => {
							this.startClaudeCode(true);
						}).open();
					})
			);

		// --- Copy command ---
		new Setting(containerEl)
			.setName("Manual start command")
			.setDesc(
				"Copy the full command to run Claude Code from your vault directory."
			)
			.addButton((btn) =>
				btn
					.setButtonText("Copy command")
					.onClick(() => {
						const vaultPath = this.getVaultPath();
						const cmd = vaultPath
							? `cd "${vaultPath}" && claude --dangerously-load-development-channels server:inline-claude`
							: "claude --dangerously-load-development-channels server:inline-claude";
						navigator.clipboard.writeText(cmd);
						new Notice("Command copied to clipboard");
					})
			);

		containerEl.createEl("hr");

		// --- Settings ---
		new Setting(containerEl)
			.setName("Trigger phrase")
			.setDesc(
				"Type this to open the Claude chat dropdown"
			)
			.addText((text) =>
				text
					.setPlaceholder(";;")
					.setValue(this.plugin.settings.triggerPhrase)
					.onChange(async (value) => {
						this.plugin.settings.triggerPhrase = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Channel port")
			.setDesc(
				"Port the channel server listens on. Use a different port for each vault."
			)
			.addText((text) =>
				text
					.setPlaceholder("4321")
					.setValue(String(this.plugin.settings.channelPort))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
							this.plugin.settings.channelPort = parsed;
							await this.plugin.saveSettings();
							// Re-run setup to update .mcp.json with new port
							const { ensureSetup } = require("./setup");
							await ensureSetup(this.plugin);
						}
					})
			);

		new Setting(containerEl)
			.setName("Response timeout (seconds)")
			.setDesc(
				"How long to wait for a response before showing a timeout error."
			)
			.addText((text) =>
				text
					.setPlaceholder("300")
					.setValue(String(this.plugin.settings.pollingTimeoutSecs))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed) && parsed > 0) {
							this.plugin.settings.pollingTimeoutSecs = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		containerEl.createEl("hr");

		// --- Channel Instructions (CLAUDE.md) ---
		containerEl.createEl("h3", { text: "Channel instructions (CLAUDE.md)" });
		containerEl.createEl("p", {
			text: "These instructions are written to .obsidian/plugins/inline-claude/CLAUDE.md and shape how Claude behaves when responding to your questions. Your vault root CLAUDE.md includes them via an @include line.",
			cls: "setting-item-description",
		});

		const pre = containerEl.createEl("pre", {
			cls: "inline-claude-instructions",
		});
		pre.createEl("code", {
			text: CLAUDE_MD_INSTRUCTIONS.trim(),
		});
	}

	hide(): void {
		this.plugin.onHealthChange = null;
		this.statusEl = null;
	}

	private renderStatus(el: HTMLElement): void {
		el.empty();
		const healthy = this.plugin.channelHealthy;
		const dot = healthy ? "🟢" : "⚫";
		const text = healthy ? "Connected to Claude Code" : "Not connected";
		el.createEl("p", {
			text: `${dot} ${text}`,
			cls: "inline-claude-status-text",
		});
		if (!healthy) {
			el.createEl("p", {
				text: "Start Claude Code below, or run the command manually in a terminal.",
				cls: "setting-item-description",
			});
		}
		// Warn if Bun is not installed — the channel server requires it
		if (!findBunBinary()) {
			el.createEl("p", {
				text: "⚠️ Bun is not installed. The channel server requires Bun. Install from https://bun.sh",
				cls: "setting-item-description mod-warning",
			});
		}
	}

	private startClaudeCode(skipPermissions: boolean): void {
		const claudePath = findClaudeBinary();
		if (!claudePath) {
			new Notice("Could not find 'claude' binary. Is Claude Code installed?");
			return;
		}

		const vaultPath = this.getVaultPath();
		if (!vaultPath) {
			new Notice("Could not determine vault path");
			return;
		}

		try {
			const skipFlag = skipPermissions ? " --dangerously-skip-permissions" : "";
			const cmd = `cd ${shEscape(vaultPath)} && ${shEscape(claudePath)} --dangerously-load-development-channels server:inline-claude${skipFlag}`;

			// Use open(1) to launch Terminal.app — doesn't require Automation permission
			// Write command to a temp script that keeps the shell alive
			const fs = require("fs");
			const os = require("os");
			const tmpSh = path.join(os.tmpdir(), "inline-claude-start.command");
			fs.writeFileSync(tmpSh, `#!/bin/sh\n${cmd}\nexec $SHELL\n`, { mode: 0o755 });

			// .command files open in Terminal.app by default on macOS
			execSync(`open "${tmpSh}"`);

			new Notice("Opening Terminal with Claude Code...");
			console.log("Inline Claude: opened Terminal.app via .command file");
		} catch (err) {
			console.log(`Inline Claude: failed to open terminal: ${err}`);
			new Notice(`Failed to open terminal: ${err}`);
		}
	}

	private getVaultPath(): string | null {
		const adapter = this.plugin.app.vault.adapter;
		if ("getBasePath" in adapter && typeof adapter.getBasePath === "function") {
			return adapter.getBasePath();
		}
		return null;
	}
}
