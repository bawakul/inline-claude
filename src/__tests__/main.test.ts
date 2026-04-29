import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ClaudeChatPlugin from "../main";

// vitest auto-resolves "obsidian" to src/__mocks__/obsidian.ts via vitest.config alias.

function makePlugin(): ClaudeChatPlugin {
	// Construct against the mock Plugin base class. Manifest is unused by the
	// methods we test, so an empty object is fine.
	const plugin = new (ClaudeChatPlugin as any)({} as any, {} as any);
	return plugin as ClaudeChatPlugin;
}

/**
 * Defensive cleanup setup (per checker warning #6).
 *
 * The onunload path also touches `this.healthInterval` and `this.statusBarEl`.
 * In production those are initialized in `onload`, but our tests only
 * construct the plugin — never call `onload`. main.ts contains null-guards
 * for these fields, but to make THIS test self-sufficient (not reliant on
 * those guards being preserved exactly), we explicitly set both to null
 * before calling onunload(). If main.ts's null-guards regress, the explicit
 * setup turns an obscure crash into a clear failure mode.
 */
function prepareForUnload(plugin: ClaudeChatPlugin): void {
	(plugin as any).healthInterval = null;
	(plugin as any).statusBarEl = null;
}

describe("ClaudeChatPlugin.activePollers (D-02 PollerEntry shape)", () => {
	let setIntervalSpy: ReturnType<typeof vi.spyOn>;
	let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		setIntervalSpy = vi.spyOn(global, "setInterval");
		clearIntervalSpy = vi.spyOn(global, "clearInterval");
	});

	afterEach(() => {
		setIntervalSpy.mockRestore();
		clearIntervalSpy.mockRestore();
	});

	it("registerPoller with no canvasNodeId stores { intervalId, canvasNodeId: null }", () => {
		const plugin = makePlugin();
		plugin.registerPoller("req-1", 12345 as unknown as number);
		const entry = plugin.activePollers.get("req-1");
		expect(entry).toBeDefined();
		expect(entry).toEqual({ intervalId: 12345, canvasNodeId: null });
	});

	it("registerPoller with canvasNodeId stores it on the entry", () => {
		const plugin = makePlugin();
		plugin.registerPoller("req-2", 999 as unknown as number, "node-abc");
		expect(plugin.activePollers.get("req-2")).toEqual({
			intervalId: 999,
			canvasNodeId: "node-abc",
		});
	});

	it("registerPoller with explicit null canvasNodeId stores null (markdown path equivalence)", () => {
		const plugin = makePlugin();
		plugin.registerPoller("req-3", 111 as unknown as number, null);
		expect(plugin.activePollers.get("req-3")).toEqual({
			intervalId: 111,
			canvasNodeId: null,
		});
	});

	it("cancelPoller calls clearInterval(entry.intervalId) and removes the entry", () => {
		const plugin = makePlugin();
		plugin.registerPoller("req-4", 42 as unknown as number, "node-x");
		plugin.cancelPoller("req-4");
		expect(plugin.activePollers.has("req-4")).toBe(false);
		expect(clearIntervalSpy).toHaveBeenCalledWith(42);
	});

	it("cancelPoller is a no-op for an unknown requestId", () => {
		const plugin = makePlugin();
		plugin.cancelPoller("does-not-exist");
		expect(clearIntervalSpy).not.toHaveBeenCalled();
	});

	it("onunload clears every poller's intervalId via entry.intervalId", () => {
		const plugin = makePlugin();
		plugin.registerPoller("a", 1 as unknown as number, "node-1");
		plugin.registerPoller("b", 2 as unknown as number, null);
		// Defensive cleanup setup (checker warning #6) — see helper above.
		prepareForUnload(plugin);
		plugin.onunload();
		expect(plugin.activePollers.size).toBe(0);
		expect(clearIntervalSpy).toHaveBeenCalledWith(1);
		expect(clearIntervalSpy).toHaveBeenCalledWith(2);
	});
});
