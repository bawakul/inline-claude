import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findTrigger } from "../suggest";

describe("findTrigger", () => {
	it('detects ;; at the start of line with content after', () => {
		const result = findTrigger(";;hello", 7, ";;");
		expect(result).toEqual({ triggerIndex: 0, query: "hello" });
	});

	it('detects ;; in the middle of a line', () => {
		const result = findTrigger("some text ;;question", 20, ";;");
		expect(result).toEqual({ triggerIndex: 10, query: "question" });
	});

	it('returns null when trigger is absent', () => {
		const result = findTrigger("no trigger here", 15, ";;");
		expect(result).toBeNull();
	});

	it('returns empty query when only trigger is typed', () => {
		const result = findTrigger(";;", 2, ";;");
		expect(result).toEqual({ triggerIndex: 0, query: "" });
	});

	it('works with custom trigger phrase', () => {
		const result = findTrigger("text ??question", 15, "??");
		expect(result).toEqual({ triggerIndex: 5, query: "question" });
	});

	it('uses last occurrence of trigger phrase', () => {
		const result = findTrigger(";;first ;;second", 16, ";;");
		expect(result).toEqual({ triggerIndex: 8, query: "second" });
	});

	it('only considers text before cursor', () => {
		// Cursor at position 5, trigger at position 10 → not found
		const result = findTrigger("hello ;;world", 5, ";;");
		expect(result).toBeNull();
	});

	it('handles single-char trigger', () => {
		const result = findTrigger("text /ask claude", 16, "/");
		expect(result).toEqual({ triggerIndex: 5, query: "ask claude" });
	});

	it('handles longer trigger phrase', () => {
		const result = findTrigger("text :::claude question", 23, ":::");
		expect(result).toEqual({ triggerIndex: 5, query: "claude question" });
	});
});

// --- Wiring tests for selectSuggestion ---

const { mockSendPrompt, mockPollReply } = vi.hoisted(() => ({
	mockSendPrompt: vi.fn(),
	mockPollReply: vi.fn(),
}));

vi.mock("../channel-client", () => ({
	sendPrompt: mockSendPrompt,
	pollReply: mockPollReply,
}));

// We need to import after the mock declarations are set up
import { ClaudeSuggest } from "../suggest";
import { App, Editor, TFile } from "obsidian";

function makePlugin(overrides?: {
	channelPort?: number;
	pollingTimeoutMs?: number;
	activeFilePath?: string | null;
}) {
	const app = new App();
	// Override getActiveFile if needed
	if (overrides?.activeFilePath !== undefined) {
		if (overrides.activeFilePath === null) {
			app.workspace.getActiveFile = () => null;
		} else {
			const f = new TFile();
			f.path = overrides.activeFilePath;
			app.workspace.getActiveFile = () => f;
		}
	}

	return {
		app,
		settings: {
			triggerPhrase: ";;",
			channelPort: overrides?.channelPort ?? 4321,
			pollingTimeoutMs: overrides?.pollingTimeoutMs ?? 30000,
		},
		lastQuery: null as any,
		activePollers: new Map<string, number>(),
		registerPoller(requestId: string, intervalId: number) {
			this.activePollers.set(requestId, intervalId);
		},
		cancelPoller(requestId: string) {
			const id = this.activePollers.get(requestId);
			if (id !== undefined) {
				clearInterval(id);
				this.activePollers.delete(requestId);
			}
		},
		registerInterval(id: number) {
			return id;
		},
	};
}

function makeEditorWithLines(lines: string[]) {
	const data = [...lines]; // mutable copy
	return {
		getLine: (n: number) => data[n] ?? "",
		lineCount: () => data.length,
		getCursor: () => ({ line: 0, ch: 0 }),
		replaceRange: vi.fn((text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) => {
			// Update lines to simulate replacement (simplified — works for full-line replacement)
			if (to) {
				const beforeLines = data.slice(0, from.line);
				const afterLines = data.slice(to.line + 1);
				const newLines = text.split("\n");
				data.length = 0;
				data.push(...beforeLines, ...newLines, ...afterLines);
			}
		}),
	} as any;
}

describe("selectSuggestion wiring", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockSendPrompt.mockReset();
		mockPollReply.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function callSelectSuggestion(plugin: ReturnType<typeof makePlugin>, editor: any, value: string) {
		const suggest = new ClaudeSuggest(plugin as any);
		const file = new TFile();
		file.path = "test.md";

		// Set up the context that selectSuggestion reads
		(suggest as any).context = {
			editor,
			start: { line: 0, ch: 0 },
			end: { line: 0, ch: value.length + 2 }, // ";;" + value
			query: value,
			file,
		};

		suggest.selectSuggestion(value, {} as MouseEvent);
	}

	it("calls sendPrompt with correct port and payload", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ channelPort: 5555 });
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		// Flush the async IIFE
		await vi.advanceTimersByTimeAsync(0);

		expect(mockSendPrompt).toHaveBeenCalledOnce();
		expect(mockSendPrompt).toHaveBeenCalledWith(5555, {
			filename: "test.md",
			line: 0,
			query: "hello",
		});
	});

	it("replaces callout with error on send failure", async () => {
		mockSendPrompt.mockResolvedValue({ ok: false, error: "Connection refused" });

		const plugin = makePlugin();
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);

		// editor.replaceRange should have been called twice:
		// 1. insertCallout (initial), 2. replaceCalloutBlock (error replacement)
		expect(editor.replaceRange).toHaveBeenCalledTimes(2);
		const lastCall = editor.replaceRange.mock.calls[1];
		expect(lastCall[0]).toContain("> [!claude] Error");
		expect(lastCall[0]).toContain("Connection refused");
	});

	it("replaces callout with response on poll complete", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "complete", response: "Markdown is a markup language." });

		const plugin = makePlugin();
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");

		// Flush the send
		await vi.advanceTimersByTimeAsync(0);

		// Advance past the first interval tick (1000ms)
		await vi.advanceTimersByTimeAsync(1000);

		// The poller should have been cancelled after completion
		expect(plugin.activePollers.size).toBe(0);

		// Check that replaceRange was called with response content
		const replaceCalls = editor.replaceRange.mock.calls;
		const lastCall = replaceCalls[replaceCalls.length - 1];
		expect(lastCall[0]).toContain("> [!claude-done]+");
		expect(lastCall[0]).toContain("Markdown is a markup language.");
	});

	it("replaces callout with error on poll error", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: false, error: "HTTP 500" });

		const plugin = makePlugin();
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.size).toBe(0);

		const replaceCalls = editor.replaceRange.mock.calls;
		const lastCall = replaceCalls[replaceCalls.length - 1];
		expect(lastCall[0]).toContain("> [!claude] Error");
		expect(lastCall[0]).toContain("HTTP 500");
	});

	it("replaces callout with timeout error when polling exceeds pollingTimeoutMs", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutMs: 3000 });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");

		// Flush send
		await vi.advanceTimersByTimeAsync(0);

		// Advance 4 ticks (4000ms > 3000ms timeout)
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.size).toBe(0);

		const replaceCalls = editor.replaceRange.mock.calls;
		const lastCall = replaceCalls[replaceCalls.length - 1];
		expect(lastCall[0]).toContain("> [!claude] Error");
		expect(lastCall[0]).toContain("Timed out waiting for Claude's response");
	});

	it("cancels poller silently when active file changes", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ activeFilePath: "test.md" });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);

		// Simulate user navigating to a different file
		const differentFile = new TFile();
		differentFile.path = "other.md";
		plugin.app.workspace.getActiveFile = () => differentFile;

		// Advance one tick — poller should detect file change and cancel
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.size).toBe(0);

		// Should NOT have called replaceRange for error/response (only the initial insertCallout)
		expect(editor.replaceRange).toHaveBeenCalledTimes(1);
	});

	it("registers poller with plugin on successful send", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);

		expect(plugin.activePollers.size).toBe(1);
		expect(plugin.activePollers.has("r1")).toBe(true);
	});
});
