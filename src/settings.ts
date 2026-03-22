import { App, PluginSettingTab, Setting } from "obsidian";
import type ClaudeChatPlugin from "./main";

export interface ClaudeChatSettings {
	triggerPhrase: string;
	channelPort: number;
	pollingTimeoutMs: number;
}

export const DEFAULT_SETTINGS: ClaudeChatSettings = {
	triggerPhrase: ";;",
	channelPort: 4321,
	pollingTimeoutMs: 30000,
};

export class ClaudeChatSettingTab extends PluginSettingTab {
	plugin: ClaudeChatPlugin;

	constructor(app: App, plugin: ClaudeChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

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
				"Port the Claude channel server listens on (default: 4321)"
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
						}
					})
			);

		new Setting(containerEl)
			.setName("Polling timeout")
			.setDesc(
				"Max milliseconds to wait for a Claude response (default: 30000)"
			)
			.addText((text) =>
				text
					.setPlaceholder("30000")
					.setValue(String(this.plugin.settings.pollingTimeoutMs))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed) && parsed > 0) {
							this.plugin.settings.pollingTimeoutMs = parsed;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}
