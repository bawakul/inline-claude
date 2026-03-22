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

	async onload() {
		await this.loadSettings();
		this.registerEditorSuggest(new ClaudeSuggest(this));
		this.addSettingTab(new ClaudeChatSettingTab(this.app, this));
		console.log("Claude Chat plugin loaded");
	}

	onunload() {
		console.log("Claude Chat plugin unloaded");
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
