import { Plugin, Notice } from "obsidian";
import { ClaudeSuggest } from "./suggest";
import {
	ClaudeChatSettings,
	DEFAULT_SETTINGS,
	ClaudeChatSettingTab,
} from "./settings";
import { ensureSetup } from "./setup";
import { requestUrl } from "obsidian";

export default class ClaudeChatPlugin extends Plugin {
	settings: ClaudeChatSettings = DEFAULT_SETTINGS;
	lastQuery: { filename: string; line: number; query: string } | null =
		null;
	activePollers: Map<string, number> = new Map();
	channelHealthy: boolean = false;
	/**
	 * The session_id returned by the channel server's /health endpoint.
	 * A new UUID is generated each time a bun process starts, so a change
	 * in this value means a different bun (and likely a different claude)
	 * is now answering on the port.
	 */
	channelSessionId: string | null = null;
	private healthInterval: number | null = null;
	statusBarEl: HTMLElement | null = null;
	onHealthChange: (() => void) | null = null;

	async onload() {
		await this.loadSettings();
		this.registerEditorSuggest(new ClaudeSuggest(this));
		this.addSettingTab(new ClaudeChatSettingTab(this.app, this));

		// Auto-setup: ensure .mcp.json and CLAUDE.md are in place
		await ensureSetup(this);

		// Status bar indicator
		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar();

		// Start health polling
		this.startHealthPolling();

		console.log("Inline Claude plugin loaded");
	}

	onunload() {
		const count = this.activePollers.size;
		for (const [, intervalId] of this.activePollers) {
			clearInterval(intervalId);
		}
		this.activePollers.clear();
		if (count > 0) {
			console.log(`Cleaned up ${count} active pollers`);
		}

		if (this.healthInterval !== null) {
			clearInterval(this.healthInterval);
			this.healthInterval = null;
		}

		console.log("Inline Claude plugin unloaded");
	}

	registerPoller(requestId: string, intervalId: number): void {
		this.activePollers.set(requestId, intervalId);
		console.log(`Polling started for ${requestId}`);
	}

	cancelPoller(requestId: string): void {
		const intervalId = this.activePollers.get(requestId);
		if (intervalId !== undefined) {
			clearInterval(intervalId);
			this.activePollers.delete(requestId);
			console.log(`Polling cancelled for ${requestId}`);
		}
	}

	startHealthPolling(): void {
		// Check immediately, then every 5 seconds
		this.checkHealth();
		this.healthInterval = setInterval(() => {
			this.checkHealth();
		}, 5000) as unknown as number;
		this.registerInterval(this.healthInterval);
	}

	async checkHealth(): Promise<void> {
		try {
			const res = await requestUrl({
				url: `http://127.0.0.1:${this.settings.channelPort}/health`,
				method: "GET",
				throw: false,
			});
			if (res.status === 200) {
				this.channelHealthy = true;
				// Extract session_id from JSON response (v0.2.0+).
				// Older channel.js versions return plain "ok" text — tolerate both.
				try {
					const body = res.json as { session_id?: string };
					const newSessionId = body?.session_id ?? null;
					if (
						newSessionId &&
						this.channelSessionId &&
						newSessionId !== this.channelSessionId
					) {
						// The bun process changed — a different claude now owns the port.
						// Show a notice so the user knows to restart the intended session.
						console.log(
							`Inline Claude: channel session changed (${this.channelSessionId} → ${newSessionId}). ` +
							"A different claude instance may now own the channel."
						);
						new Notice(
							"Inline Claude: the channel server restarted or a different Claude session took over. " +
							"If messages are not reaching your Claude, close other Claude sessions and restart."
						);
					}
					this.channelSessionId = newSessionId;
				} catch {
					// JSON parse failed — old plain-text /health, ignore session tracking
					this.channelSessionId = null;
				}
			} else {
				this.channelHealthy = false;
				this.channelSessionId = null;
			}
		} catch {
			this.channelHealthy = false;
			this.channelSessionId = null;
		}
		this.updateStatusBar();
		this.onHealthChange?.();
	}

	updateStatusBar(): void {
		if (this.statusBarEl) {
			if (this.channelHealthy) {
				this.statusBarEl.setText("🟢 Inline Claude");
			} else {
				this.statusBarEl.setText("⚫ Inline Claude");
			}
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
