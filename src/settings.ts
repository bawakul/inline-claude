import { App, PluginSettingTab, Setting } from "obsidian";
import type ClaudeChatPlugin from "./main";

export interface ClaudeChatSettings {
	triggerPhrase: string;
}

export const DEFAULT_SETTINGS: ClaudeChatSettings = {
	triggerPhrase: ";;",
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
	}
}
