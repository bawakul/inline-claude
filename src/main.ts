import { Plugin, Notice } from "obsidian";
import { ClaudeSuggest } from "./suggest";
import {
	ClaudeChatSettings,
	DEFAULT_SETTINGS,
	ClaudeChatSettingTab,
} from "./settings";
import { ensureSetup } from "./setup";
import { registerClaudePostProcessor } from "./post-processor";
import { requestUrl } from "obsidian";

export type PendingRequest = {
	query: string;
	startTime: number;
	status: "thinking" | "error" | "done";
	nearLine: number;
	errorMessage?: string;
	retryable?: boolean;
	retryOf?: string;
};

export default class ClaudeChatPlugin extends Plugin {
	settings: ClaudeChatSettings = DEFAULT_SETTINGS;
	lastQuery: { filename: string; line: number; query: string } | null =
		null;
	activePollers: Map<string, number> = new Map();
	pendingRequests: Map<string, PendingRequest> = new Map();
	channelHealthy: boolean = false;
	private healthInterval: number | null = null;
	statusBarEl: HTMLElement | null = null;
	onHealthChange: (() => void) | null = null;

	async onload() {
		await this.loadSettings();
		this.registerEditorSuggest(new ClaudeSuggest(this));
		this.addSettingTab(new ClaudeChatSettingTab(this.app, this));

		// Auto-setup: ensure .mcp.json and CLAUDE.md are in place
		await ensureSetup(this);

		// Register post-processor for DOM-only timer rendering in pending callouts
		registerClaudePostProcessor(this);

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

	addPendingRequest(requestId: string, query: string, nearLine: number): void {
		this.pendingRequests.set(requestId, {
			query,
			startTime: Date.now(),
			status: "thinking",
			nearLine,
		});
		console.log(`Pending request added: ${requestId}`);
	}

	removePendingRequest(requestId: string): void {
		this.pendingRequests.delete(requestId);
		console.log(`Pending request removed: ${requestId}`);
	}

	updatePendingRequest(requestId: string, fields: Partial<PendingRequest>): void {
		const entry = this.pendingRequests.get(requestId);
		if (entry) {
			Object.assign(entry, fields);
			console.log(`Pending request updated: ${requestId} → ${fields.status ?? entry.status}`);
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
			this.channelHealthy = res.status === 200;
		} catch {
			this.channelHealthy = false;
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
