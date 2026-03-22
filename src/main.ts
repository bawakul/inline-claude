import { Plugin } from "obsidian";
import { ClaudeSuggest } from "./suggest";
import {
	ClaudeChatSettings,
	DEFAULT_SETTINGS,
	ClaudeChatSettingTab,
} from "./settings";

export default class ClaudeChatPlugin extends Plugin {
	settings: ClaudeChatSettings = DEFAULT_SETTINGS;
	lastQuery: { filename: string; line: number; query: string } | null =
		null;
	activePollers: Map<string, number> = new Map();

	async onload() {
		await this.loadSettings();
		this.registerEditorSuggest(new ClaudeSuggest(this));
		this.addSettingTab(new ClaudeChatSettingTab(this.app, this));
		console.log("Claude Chat plugin loaded");
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
		console.log("Claude Chat plugin unloaded");
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
