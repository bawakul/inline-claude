import { describe, it, expect, vi, beforeEach } from "vitest";
import { Notice } from "obsidian";

// K008: vi.hoisted() for mock fns used inside vi.mock factories
const { mockExecSync } = vi.hoisted(() => ({
	mockExecSync: vi.fn(),
}));

vi.mock("child_process", () => ({
	execSync: mockExecSync,
	spawn: vi.fn(),
}));

// Mock fs — settings.ts uses require("fs") in startClaudeCode
vi.mock("fs", () => ({
	existsSync: vi.fn().mockReturnValue(false),
	writeFileSync: vi.fn(),
}));

beforeEach(() => {
	mockExecSync.mockReset();
	Notice.reset();
});

/**
 * Minimal DOM-like element tree for testing Obsidian settings rendering.
 * Each element tracks its children, text, and class for assertions.
 */
function createMockElement(tag = "div", attrs?: { text?: string; cls?: string }): any {
	const children: any[] = [];
	const el: any = {
		_tag: tag,
		_text: attrs?.text ?? "",
		_cls: attrs?.cls ?? "",
		_children: children,
		empty() {
			children.length = 0;
			el._text = "";
		},
		createEl(childTag: string, childAttrs?: { text?: string; cls?: string }) {
			const child = createMockElement(childTag, childAttrs);
			children.push(child);
			return child;
		},
		setText(text: string) {
			el._text = text;
		},
	};
	return el;
}

/** Collect all text from an element tree (depth-first) */
function collectText(el: any): string {
	let text = el._text || "";
	for (const child of el._children || []) {
		text += " " + collectText(child);
	}
	return text.trim();
}

/** Find an element in the tree matching a predicate */
function findInTree(el: any, predicate: (node: any) => boolean): any | null {
	if (predicate(el)) return el;
	for (const child of el._children || []) {
		const found = findInTree(child, predicate);
		if (found) return found;
	}
	return null;
}

function createMockPlugin(overrides: Record<string, any> = {}): any {
	return {
		app: {
			vault: {
				adapter: {
					getBasePath: () => "/mock/vault",
				},
			},
		},
		manifest: { version: "1.0.0", dir: ".obsidian/plugins/inline-claude" },
		settings: {
			triggerPhrase: ";;",
			channelPort: 4321,
			pollingTimeoutSecs: 60,
		},
		channelHealthy: false,
		onHealthChange: null,
		loadData: vi.fn().mockResolvedValue({}),
		saveData: vi.fn().mockResolvedValue(undefined),
		saveSettings: vi.fn().mockResolvedValue(undefined),
		addStatusBarItem: vi.fn().mockReturnValue({ setText: vi.fn() }),
		...overrides,
	};
}

describe("ClaudeChatSettingTab", () => {
	describe("health callback lifecycle", () => {
		it("registers onHealthChange callback on display()", async () => {
			// Bun is present so we don't trigger the warning path
			mockExecSync.mockReturnValue("/usr/local/bin/bun\n");

			const { ClaudeChatSettingTab } = await import("../settings");
			const { App } = await import("obsidian");

			const app = new App();
			const plugin = createMockPlugin();

			const tab = new ClaudeChatSettingTab(app, plugin);
			// Replace containerEl with our mock DOM
			(tab as any).containerEl = createMockElement();

			expect(plugin.onHealthChange).toBeNull();

			tab.display();

			expect(plugin.onHealthChange).not.toBeNull();
			expect(typeof plugin.onHealthChange).toBe("function");
		});

		it("health callback triggers renderStatus re-render", async () => {
			mockExecSync.mockReturnValue("/usr/local/bin/bun\n");

			const { ClaudeChatSettingTab } = await import("../settings");
			const { App } = await import("obsidian");

			const app = new App();
			const plugin = createMockPlugin({ channelHealthy: false });

			const tab = new ClaudeChatSettingTab(app, plugin);
			(tab as any).containerEl = createMockElement();

			tab.display();

			// Status should show "Not connected" initially
			const statusEl = (tab as any).statusEl;
			expect(collectText(statusEl)).toContain("Not connected");

			// Simulate health changing
			plugin.channelHealthy = true;
			plugin.onHealthChange();

			// Status should now show "Connected"
			expect(collectText(statusEl)).toContain("Connected to Claude Code");
		});

		it("hide() deregisters health callback", async () => {
			mockExecSync.mockReturnValue("/usr/local/bin/bun\n");

			const { ClaudeChatSettingTab } = await import("../settings");
			const { App } = await import("obsidian");

			const app = new App();
			const plugin = createMockPlugin();

			const tab = new ClaudeChatSettingTab(app, plugin);
			(tab as any).containerEl = createMockElement();

			tab.display();
			expect(plugin.onHealthChange).not.toBeNull();

			tab.hide();
			expect(plugin.onHealthChange).toBeNull();
		});

		it("hide() clears statusEl reference", async () => {
			mockExecSync.mockReturnValue("/usr/local/bin/bun\n");

			const { ClaudeChatSettingTab } = await import("../settings");
			const { App } = await import("obsidian");

			const app = new App();
			const plugin = createMockPlugin();

			const tab = new ClaudeChatSettingTab(app, plugin);
			(tab as any).containerEl = createMockElement();

			tab.display();
			expect((tab as any).statusEl).not.toBeNull();

			tab.hide();
			expect((tab as any).statusEl).toBeNull();
		});
	});

	describe("Bun warning in settings", () => {
		it("shows Bun missing warning when bun is not installed", async () => {
			// findBunBinary() will call execSync("which bun") which throws
			mockExecSync.mockImplementation((cmd: string) => {
				if (cmd === "which bun") throw new Error("not found");
				// findClaudeBinary also uses execSync — let it fail gracefully
				throw new Error("not found");
			});

			const { ClaudeChatSettingTab } = await import("../settings");
			const { App } = await import("obsidian");

			const app = new App();
			const plugin = createMockPlugin({ channelHealthy: false });

			const tab = new ClaudeChatSettingTab(app, plugin);
			(tab as any).containerEl = createMockElement();

			tab.display();

			const statusEl = (tab as any).statusEl;
			const allText = collectText(statusEl);
			expect(allText).toContain("Bun is not installed");
			expect(allText).toContain("https://bun.sh");
		});

		it("does not show Bun warning when bun is installed", async () => {
			mockExecSync.mockReturnValue("/usr/local/bin/bun\n");

			const { ClaudeChatSettingTab } = await import("../settings");
			const { App } = await import("obsidian");

			const app = new App();
			const plugin = createMockPlugin({ channelHealthy: true });

			const tab = new ClaudeChatSettingTab(app, plugin);
			(tab as any).containerEl = createMockElement();

			tab.display();

			const statusEl = (tab as any).statusEl;
			const allText = collectText(statusEl);
			expect(allText).not.toContain("Bun is not installed");
		});

		it("Bun warning re-renders with status on health change", async () => {
			mockExecSync.mockImplementation((cmd: string) => {
				if (cmd === "which bun") throw new Error("not found");
				throw new Error("not found");
			});

			const { ClaudeChatSettingTab } = await import("../settings");
			const { App } = await import("obsidian");

			const app = new App();
			const plugin = createMockPlugin({ channelHealthy: false });

			const tab = new ClaudeChatSettingTab(app, plugin);
			(tab as any).containerEl = createMockElement();

			tab.display();

			// Health changes — callback fires — status should still show Bun warning
			plugin.channelHealthy = true;
			plugin.onHealthChange();

			const statusEl = (tab as any).statusEl;
			const allText = collectText(statusEl);
			expect(allText).toContain("Connected to Claude Code");
			expect(allText).toContain("Bun is not installed");
		});
	});
});
