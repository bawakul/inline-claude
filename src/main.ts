import { Plugin } from "obsidian";

export default class ClaudeChatPlugin extends Plugin {
	async onload() {
		console.log("Claude Chat plugin loaded");
	}

	onunload() {
		console.log("Claude Chat plugin unloaded");
	}
}
