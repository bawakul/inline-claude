import { describe, it, expect, vi, beforeEach } from "vitest";
import { Notice } from "obsidian";

// K008: vi.hoisted() for mock fns used inside vi.mock factories
const { mockExecSync } = vi.hoisted(() => ({
	mockExecSync: vi.fn(),
}));

vi.mock("child_process", () => ({
	execSync: mockExecSync,
}));

// Mock requestUrl for ensureSetup's ensureChannelJs call
const { mockRequestUrl } = vi.hoisted(() => ({
	mockRequestUrl: vi.fn(),
}));

vi.mock("obsidian", async (importOriginal) => {
	const original = await importOriginal<typeof import("obsidian")>();
	return {
		...original,
		requestUrl: mockRequestUrl,
	};
});

// Mock fs — ensureSetup uses fs.existsSync, fs.readFileSync, fs.writeFileSync
const { mockExistsSync, mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
	mockExistsSync: vi.fn(),
	mockReadFileSync: vi.fn(),
	mockWriteFileSync: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
	const original = await importOriginal<typeof import("fs")>();
	return {
		...original,
		existsSync: mockExistsSync,
		readFileSync: mockReadFileSync,
		writeFileSync: mockWriteFileSync,
	};
});

beforeEach(() => {
	mockExecSync.mockReset();
	mockRequestUrl.mockReset();
	mockExistsSync.mockReset();
	mockReadFileSync.mockReset();
	mockWriteFileSync.mockReset();
	Notice.reset();
});

describe("findBunBinary", () => {
	it("returns path when bun is found", async () => {
		// Dynamic import so the vi.mock("child_process") is in effect
		const { findBunBinary } = await import("../setup");
		mockExecSync.mockReturnValue("/usr/local/bin/bun\n");

		const result = findBunBinary();

		expect(result).toBe("/usr/local/bin/bun");
		expect(mockExecSync).toHaveBeenCalledWith("which bun", { encoding: "utf-8" });
	});

	it("returns null when bun is not found via which or direct paths", async () => {
		const { findBunBinary } = await import("../setup");
		mockExecSync.mockImplementation(() => {
			throw new Error("not found");
		});
		// Direct path checks also fail
		mockExistsSync.mockReturnValue(false);

		const result = findBunBinary();

		expect(result).toBeNull();
	});

	it("returns null when which returns empty string and direct paths don't exist", async () => {
		const { findBunBinary } = await import("../setup");
		mockExecSync.mockReturnValue("   \n");
		mockExistsSync.mockReturnValue(false);

		const result = findBunBinary();

		expect(result).toBeNull();
	});

	it("finds bun via direct path when which fails (Obsidian PATH issue)", async () => {
		const { findBunBinary } = await import("../setup");
		mockExecSync.mockImplementation(() => {
			throw new Error("not found");
		});
		// Simulate ~/.bun/bin/bun existing on disk
		mockExistsSync.mockImplementation((p: string) =>
			p.includes(".bun/bin/bun") ? true : false
		);

		const result = findBunBinary();

		expect(result).toMatch(/\.bun\/bin\/bun$/);
	});
});

describe("ensureSetup", () => {
	it("shows Notice when bun is missing", async () => {
		const { ensureSetup } = await import("../setup");

		// findBunBinary's execSync call should throw (bun not found)
		mockExecSync.mockImplementation(() => {
			throw new Error("not found");
		});

		// requestUrl for ensureChannelJs — return 200 so it doesn't error
		mockRequestUrl.mockResolvedValue({ status: 200, text: "// channel.js" });

		// fs mocks: channel.js doesn't exist (triggers download),
		// .mcp.json doesn't exist, CLAUDE.md doesn't exist
		mockExistsSync.mockReturnValue(false);
		mockWriteFileSync.mockImplementation(() => {});

		// Build a minimal plugin mock matching ClaudeChatPlugin shape
		const plugin = {
			app: {
				vault: {
					adapter: {
						getBasePath: () => "/mock/vault",
						exists: vi.fn().mockResolvedValue(false),
						write: vi.fn().mockResolvedValue(undefined),
					},
				},
			},
			manifest: { version: "1.0.0", dir: ".obsidian/plugins/inline-claude" },
			settings: { channelPort: 4321 },
		} as any;

		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await ensureSetup(plugin);

		// Verify Notice was shown with bun install instructions
		const bunNotice = Notice.instances.find(
			(n) => n.message.includes("bun") || n.message.includes("Bun")
		);
		expect(bunNotice).toBeDefined();
		expect(bunNotice!.message).toContain("https://bun.sh");

		// Verify console.log warning
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining("bun not found")
		);

		consoleSpy.mockRestore();
	});

	it("does not show Notice when bun is installed", async () => {
		const { ensureSetup } = await import("../setup");

		// findBunBinary's execSync returns a valid path
		mockExecSync.mockReturnValue("/usr/local/bin/bun\n");

		mockRequestUrl.mockResolvedValue({ status: 200, text: "// channel.js" });
		mockExistsSync.mockReturnValue(false);
		mockWriteFileSync.mockImplementation(() => {});

		const plugin = {
			app: {
				vault: {
					adapter: {
						getBasePath: () => "/mock/vault",
						exists: vi.fn().mockResolvedValue(false),
						write: vi.fn().mockResolvedValue(undefined),
					},
				},
			},
			manifest: { version: "1.0.0", dir: ".obsidian/plugins/inline-claude" },
			settings: { channelPort: 4321 },
		} as any;

		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await ensureSetup(plugin);

		// No bun-related Notice should have been created
		const bunNotice = Notice.instances.find(
			(n) => n.message.includes("bun") || n.message.includes("Bun")
		);
		// There may be other Notices (e.g. "downloading channel server"), but not the bun warning
		const bunWarning = Notice.instances.find(
			(n) => n.message.includes("https://bun.sh")
		);
		expect(bunWarning).toBeUndefined();

		consoleSpy.mockRestore();
	});

	it("continues setup even when bun is missing", async () => {
		const { ensureSetup } = await import("../setup");

		// Bun not found
		mockExecSync.mockImplementation(() => {
			throw new Error("not found");
		});

		mockRequestUrl.mockResolvedValue({ status: 200, text: "// channel.js" });
		mockExistsSync.mockReturnValue(false);
		mockWriteFileSync.mockImplementation(() => {});

		const plugin = {
			app: {
				vault: {
					adapter: {
						getBasePath: () => "/mock/vault",
						exists: vi.fn().mockResolvedValue(false),
						write: vi.fn().mockResolvedValue(undefined),
					},
				},
			},
			manifest: { version: "1.0.0", dir: ".obsidian/plugins/inline-claude" },
			settings: { channelPort: 4321 },
		} as any;

		vi.spyOn(console, "log").mockImplementation(() => {});

		// Should NOT throw — setup continues despite missing bun
		await expect(ensureSetup(plugin)).resolves.toBeUndefined();

		// ensureRootClaudeMd should have been called (writes CLAUDE.md)
		// It's the last step, so if writeFileSync was called for CLAUDE.md path, setup completed
		expect(mockWriteFileSync).toHaveBeenCalled();

		vi.restoreAllMocks();
	});
});
