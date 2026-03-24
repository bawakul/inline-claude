// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThinkingRenderChild, ErrorRenderChild, registerClaudePostProcessor } from "../post-processor";
import type { PendingRequest } from "../main";

// Mock retryRequest from suggest.ts to avoid circular dependency in tests
const { mockRetryRequest } = vi.hoisted(() => ({
	mockRetryRequest: vi.fn(),
}));
vi.mock("../suggest", () => ({
	retryRequest: mockRetryRequest,
}));

// --- Helpers ---

/**
 * Build a realistic callout DOM structure matching what Obsidian renders
 * for `> [!claude] some question <!-- rid:UUID -->`.
 */
function buildCalloutDOM(
	dataCallout: string,
	titleText: string,
	rid?: string
): { section: HTMLElement; callout: HTMLElement } {
	const section = document.createElement("div");
	const callout = document.createElement("div");
	callout.className = "callout";
	callout.setAttribute("data-callout", dataCallout);

	const ridComment = rid ? ` <!-- rid:${rid} -->` : "";
	callout.innerHTML = `<div class="callout-title"><div class="callout-title-inner">${titleText}${ridComment}</div></div><div class="callout-content"></div>`;
	section.appendChild(callout);

	return { section, callout };
}

/**
 * Create a mock plugin with pendingRequests map and
 * registerMarkdownPostProcessor that captures the callback.
 */
function createMockPlugin() {
	const plugin = {
		pendingRequests: new Map<string, PendingRequest>(),
		registerMarkdownPostProcessor: vi.fn(),
		_postProcessor: null as ((el: HTMLElement, ctx: any) => void) | null,
	};

	plugin.registerMarkdownPostProcessor.mockImplementation((cb: any) => {
		plugin._postProcessor = cb;
	});

	return plugin;
}

/**
 * Create a mock MarkdownPostProcessorContext.
 */
function createMockCtx() {
	return {
		docId: "",
		sourcePath: "",
		addChild: vi.fn(),
		getSectionInfo: () => null,
	};
}

// --- ThinkingRenderChild Tests ---

describe("ThinkingRenderChild", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Fix Date.now to a known value so formatElapsed produces predictable output
		vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("creates timer and dot elements on onload()", () => {
		const { callout } = buildCalloutDOM("claude", "my question", "test-123");
		// startTime is 5 seconds before "now"
		const startTime = Date.now() - 5000;
		const child = new ThinkingRenderChild(callout, startTime);

		child.onload();

		const dot = callout.querySelector(".claude-pulse-dot");
		expect(dot).not.toBeNull();
		expect(dot!.textContent).toBe("●");

		const timer = callout.querySelector(".claude-timer");
		expect(timer).not.toBeNull();
		expect(timer!.textContent).toBe("5s");
	});

	it("updates timer text every second", () => {
		const { callout } = buildCalloutDOM("claude", "my question", "test-123");
		const startTime = Date.now() - 5000;
		const child = new ThinkingRenderChild(callout, startTime);

		child.onload();

		// Advance 3 seconds
		vi.advanceTimersByTime(3000);

		const timer = callout.querySelector(".claude-timer");
		expect(timer).not.toBeNull();
		// 5s initial + 3s elapsed = 8s
		expect(timer!.textContent).toBe("8s");
	});

	it("stops updating timer after onunload()", () => {
		const { callout } = buildCalloutDOM("claude", "my question", "test-123");
		const startTime = Date.now() - 5000;
		const child = new ThinkingRenderChild(callout, startTime);

		child.onload();
		const timer = callout.querySelector(".claude-timer");
		expect(timer).not.toBeNull();

		// Unload — should clear interval
		child.onunload();

		// Advance time — timer text should NOT update since interval is cleared
		vi.advanceTimersByTime(5000);

		// Timer element was removed from DOM on unload
		expect(callout.querySelector(".claude-timer")).toBeNull();
	});

	it("removes injected DOM elements on onunload()", () => {
		const { callout } = buildCalloutDOM("claude", "my question", "test-123");
		const startTime = Date.now() - 1000;
		const child = new ThinkingRenderChild(callout, startTime);

		child.onload();
		expect(callout.querySelector(".claude-pulse-dot")).not.toBeNull();
		expect(callout.querySelector(".claude-timer")).not.toBeNull();

		child.onunload();

		expect(callout.querySelector(".claude-pulse-dot")).toBeNull();
		expect(callout.querySelector(".claude-timer")).toBeNull();
	});

	it("formats elapsed time using formatElapsed()", () => {
		const { callout } = buildCalloutDOM("claude", "my question", "test-123");
		// 90 seconds ago
		const startTime = Date.now() - 90_000;
		const child = new ThinkingRenderChild(callout, startTime);

		child.onload();

		const timer = callout.querySelector(".claude-timer");
		expect(timer).not.toBeNull();
		expect(timer!.textContent).toBe("1m 30s");
	});
});

// --- registerClaudePostProcessor Tests ---

describe("registerClaudePostProcessor", () => {
	it("registers a markdown post processor on the plugin", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);
		expect(plugin.registerMarkdownPostProcessor).toHaveBeenCalledOnce();
		expect(plugin._postProcessor).toBeTypeOf("function");
	});

	it("decorates a [!claude] callout when rid matches a thinking pending request", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("test-123", {
			query: "my question",
			startTime: Date.now() - 2000,
			status: "thinking",
			nearLine: 5,
		});

		const { section } = buildCalloutDOM("claude", "my question", "test-123");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);

		expect(ctx.addChild).toHaveBeenCalledOnce();
		const child = ctx.addChild.mock.calls[0][0];
		expect(child).toBeInstanceOf(ThinkingRenderChild);
	});

	it("ignores [!claude-done] callouts", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("test-456", {
			query: "done question",
			startTime: Date.now() - 2000,
			status: "thinking",
			nearLine: 5,
		});

		const { section } = buildCalloutDOM("claude-done", "done question", "test-456");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);

		expect(ctx.addChild).not.toHaveBeenCalled();
	});

	it("skips callout when rid is not in pendingRequests map", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		// Don't add any pending requests
		const { section } = buildCalloutDOM("claude", "orphan question", "no-match-rid");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);

		expect(ctx.addChild).not.toHaveBeenCalled();
	});

	it("skips callout when pending request status is done (not thinking or error)", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("test-789", {
			query: "done question",
			startTime: Date.now() - 2000,
			status: "done",
			nearLine: 5,
		});

		const { section } = buildCalloutDOM("claude", "done question", "test-789");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);

		expect(ctx.addChild).not.toHaveBeenCalled();
	});

	it("skips callout when no rid is present in innerHTML", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		// Build callout without rid
		const { section } = buildCalloutDOM("claude", "no rid question");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);

		expect(ctx.addChild).not.toHaveBeenCalled();
	});

	it("handles multiple callouts in one section, decorating only matching ones", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("match-1", {
			query: "question 1",
			startTime: Date.now() - 1000,
			status: "thinking",
			nearLine: 5,
		});

		// Build section with two claude callouts, only one matches
		const section = document.createElement("div");

		const callout1 = document.createElement("div");
		callout1.className = "callout";
		callout1.setAttribute("data-callout", "claude");
		callout1.innerHTML = `<div class="callout-title"><div class="callout-title-inner">question 1 <!-- rid:match-1 --></div></div><div class="callout-content"></div>`;
		section.appendChild(callout1);

		const callout2 = document.createElement("div");
		callout2.className = "callout";
		callout2.setAttribute("data-callout", "claude");
		callout2.innerHTML = `<div class="callout-title"><div class="callout-title-inner">question 2 <!-- rid:no-match --></div></div><div class="callout-content"></div>`;
		section.appendChild(callout2);

		const ctx = createMockCtx();
		plugin._postProcessor!(section, ctx);

		// Only the first callout should be decorated
		expect(ctx.addChild).toHaveBeenCalledOnce();
	});
});

// --- ErrorRenderChild Tests ---

describe("ErrorRenderChild", () => {
	beforeEach(() => {
		mockRetryRequest.mockReset();
	});

	it("adds .claude-error class when status is error", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("err-1", {
			query: "timeout question",
			startTime: Date.now() - 30000,
			status: "error",
			nearLine: 5,
			errorMessage: "Timeout",
			retryable: true,
		});

		const { section, callout } = buildCalloutDOM("claude", "timeout question", "err-1");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);

		expect(ctx.addChild).toHaveBeenCalledOnce();
		const child = ctx.addChild.mock.calls[0][0];
		expect(child).toBeInstanceOf(ErrorRenderChild);

		// Simulate Obsidian calling onload
		child.onload();

		expect(callout.classList.contains("claude-error")).toBe(true);
	});

	it("renders error message text for error state", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("err-2", {
			query: "timeout question",
			startTime: Date.now() - 30000,
			status: "error",
			nearLine: 5,
			errorMessage: "Request timed out after 30s",
			retryable: false,
		});

		const { section, callout } = buildCalloutDOM("claude", "timeout question", "err-2");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);
		ctx.addChild.mock.calls[0][0].onload();

		const msgEl = callout.querySelector(".claude-error-msg");
		expect(msgEl).not.toBeNull();
		expect(msgEl!.textContent).toBe("⚠️ Request timed out after 30s");
	});

	it("renders Retry button when retryable is true", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("err-3", {
			query: "timeout question",
			startTime: Date.now() - 30000,
			status: "error",
			nearLine: 5,
			errorMessage: "Timeout",
			retryable: true,
		});

		const { section, callout } = buildCalloutDOM("claude", "timeout question", "err-3");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);
		ctx.addChild.mock.calls[0][0].onload();

		const btn = callout.querySelector(".claude-retry-btn");
		expect(btn).not.toBeNull();
		expect(btn!.textContent).toBe("↻ Retry");
	});

	it("does not render Retry button when retryable is false", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("err-4", {
			query: "connection error question",
			startTime: Date.now() - 5000,
			status: "error",
			nearLine: 5,
			errorMessage: "Connection refused",
			retryable: false,
		});

		const { section, callout } = buildCalloutDOM("claude", "connection error question", "err-4");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);
		ctx.addChild.mock.calls[0][0].onload();

		const btn = callout.querySelector(".claude-retry-btn");
		expect(btn).toBeNull();

		// Error message should still be present
		const msgEl = callout.querySelector(".claude-error-msg");
		expect(msgEl).not.toBeNull();
	});

	it("Retry button click calls retryRequest with correct args", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("err-5", {
			query: "retry me",
			startTime: Date.now() - 30000,
			status: "error",
			nearLine: 5,
			errorMessage: "Timeout",
			retryable: true,
		});

		const { section, callout } = buildCalloutDOM("claude", "retry me", "err-5");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);
		ctx.addChild.mock.calls[0][0].onload();

		const btn = callout.querySelector(".claude-retry-btn") as HTMLButtonElement;
		expect(btn).not.toBeNull();

		btn.click();

		expect(mockRetryRequest).toHaveBeenCalledOnce();
		expect(mockRetryRequest).toHaveBeenCalledWith(plugin, "err-5");
	});

	it("error state does not show timer or pulse dot", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("err-6", {
			query: "error question",
			startTime: Date.now() - 30000,
			status: "error",
			nearLine: 5,
			errorMessage: "Timeout",
			retryable: true,
		});

		const { section, callout } = buildCalloutDOM("claude", "error question", "err-6");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);
		ctx.addChild.mock.calls[0][0].onload();

		// Error state should NOT have thinking indicators
		expect(callout.querySelector(".claude-pulse-dot")).toBeNull();
		expect(callout.querySelector(".claude-timer")).toBeNull();
	});
});

// --- ThinkingRenderChild retry hint Tests ---

describe("ThinkingRenderChild retry hint", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("shows (retry) hint for thinking state with retryOf", () => {
		const plugin = createMockPlugin();
		registerClaudePostProcessor(plugin as any);

		plugin.pendingRequests.set("retry-1", {
			query: "retried question",
			startTime: Date.now() - 2000,
			status: "thinking",
			nearLine: 5,
			retryOf: "old-rid",
		});

		const { section, callout } = buildCalloutDOM("claude", "retried question", "retry-1");
		const ctx = createMockCtx();

		plugin._postProcessor!(section, ctx);

		expect(ctx.addChild).toHaveBeenCalledOnce();
		const child = ctx.addChild.mock.calls[0][0];
		expect(child).toBeInstanceOf(ThinkingRenderChild);

		// Simulate onload
		child.onload();

		const hintEl = callout.querySelector(".claude-retry-hint");
		expect(hintEl).not.toBeNull();
		expect(hintEl!.textContent).toBe("(retry)");

		// Timer and dot should still be present (it's thinking state)
		expect(callout.querySelector(".claude-timer")).not.toBeNull();
		expect(callout.querySelector(".claude-pulse-dot")).not.toBeNull();
	});
});
