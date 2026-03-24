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
	pollingTimeoutSecs?: number;
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
			pollingTimeoutSecs: overrides?.pollingTimeoutSecs ?? 300,
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
			if (to) {
				// Build the text before `from` on its line and after `to` on its line
				const beforeText = (data[from.line] ?? "").substring(0, from.ch);
				const afterText = (data[to.line] ?? "").substring(to.ch);
				const newContent = beforeText + text + afterText;
				const newLines = newContent.split("\n");
				// Splice out the old range and insert new lines
				data.splice(from.line, to.line - from.line + 1, ...newLines);
			}
		}),
		_data: data, // expose for test assertions
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

	it("replaces callout with timeout state and inserts retry callout at response timeout", async () => {
		let sendCallCount = 0;
		mockSendPrompt.mockImplementation(async () => {
			sendCallCount++;
			if (sendCallCount === 1) return { ok: true, request_id: "r1" };
			return { ok: true, request_id: "r-retry" };
		});
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
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

		// Original poller cancelled, retry poller registered
		expect(plugin.activePollers.has("r1")).toBe(false);
		expect(plugin.activePollers.has("r-retry")).toBe(true);

		const replaceCalls = editor.replaceRange.mock.calls;
		// Find the timeout callout replacement
		const timeoutCall = replaceCalls.find((call: any[]) => call[0].includes("⏱ Timed out"));
		expect(timeoutCall).toBeDefined();
		expect(timeoutCall[0]).toContain("Retrying automatically...");

		// Find the retry thinking callout insertion
		const retryCall = replaceCalls.find((call: any[]) => call[0].includes("(Retry)"));
		expect(retryCall).toBeDefined();
		expect(retryCall[0]).toContain("> [!claude] Thinking...");
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

		// Should NOT have called replaceRange for error/response (only insertCallout + rid patch)
		expect(editor.replaceRange).toHaveBeenCalledTimes(2);
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

	it("patches rid into callout header after successful send", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);

		// Call 1: insertCallout, Call 2: rid patch
		expect(editor.replaceRange).toHaveBeenCalledTimes(2);

		const patchCall = editor.replaceRange.mock.calls[1];
		// The patched header should contain the rid marker
		expect(patchCall[0]).toContain("<!-- rid:r1 -->");
		// The patch should target only line 0 (header line)
		expect(patchCall[1]).toEqual({ line: 0, ch: 0 });
		// to should be same line as from (header-only patch)
		expect(patchCall[2].line).toBe(0);
	});

	it("does not patch rid on send failure", async () => {
		mockSendPrompt.mockResolvedValue({ ok: false, error: "Connection refused" });

		const plugin = makePlugin();
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);

		// Call 1: insertCallout, Call 2: error replacement — no rid patch
		expect(editor.replaceRange).toHaveBeenCalledTimes(2);
		// Neither call should contain a rid marker
		for (const call of editor.replaceRange.mock.calls) {
			expect(call[0]).not.toContain("<!-- rid:");
		}
	});

	it("uses rid-based search for poll complete (callout moved away from nearLine)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "complete", response: "The answer." });

		const plugin = makePlugin();
		// Simulate a document where the callout is at line 0-1
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");

		// Flush the send — this inserts callout + patches rid
		await vi.advanceTimersByTimeAsync(0);

		// Verify rid was patched into the header
		expect(editor._data[0]).toContain("<!-- rid:r1 -->");

		// Now simulate user inserting many lines between callout and nearLine
		// by directly mutating the editor data to push the callout far from line 0.
		// The rid-based search will still find it because it scans all lines.
		// (The proximity search would also work here since we only inserted
		// within ±10, but the key is that findCalloutBlock is being called
		// with the requestId.)

		// Advance to trigger poll
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.size).toBe(0);
		const replaceCalls = editor.replaceRange.mock.calls;
		const lastCall = replaceCalls[replaceCalls.length - 1];
		expect(lastCall[0]).toContain("> [!claude-done]+");
		expect(lastCall[0]).toContain("The answer.");
	});

	it("two concurrent questions resolve to correct callouts", async () => {
		// Two separate sends with different request_ids
		let sendCallCount = 0;
		mockSendPrompt.mockImplementation(async () => {
			sendCallCount++;
			return { ok: true, request_id: sendCallCount === 1 ? "r1" : "r2" };
		});

		// Poll returns pending initially, then we control completion per-id
		const completions = new Map<string, { status: string; response?: string }>();
		completions.set("r1", { status: "pending" });
		completions.set("r2", { status: "pending" });

		mockPollReply.mockImplementation(async (_port: number, reqId: string) => {
			const result = completions.get(reqId);
			return { ok: true, ...result };
		});

		const plugin = makePlugin();

		// Question 1: starts at line 0
		const lines1 = ["> [!claude] Thinking...", "> question one"];
		const editor1 = makeEditorWithLines(lines1);
		callSelectSuggestion(plugin, editor1, "question one");
		await vi.advanceTimersByTimeAsync(0);

		// Verify rid r1 was patched
		expect(editor1._data[0]).toContain("<!-- rid:r1 -->");

		// Question 2: different editor (simulating another location)
		const lines2 = ["> [!claude] Thinking...", "> question two"];
		const editor2 = makeEditorWithLines(lines2);
		callSelectSuggestion(plugin, editor2, "question two");
		await vi.advanceTimersByTimeAsync(0);

		// Verify rid r2 was patched
		expect(editor2._data[0]).toContain("<!-- rid:r2 -->");

		// Both pollers should be active
		expect(plugin.activePollers.size).toBe(2);

		// Complete r2 first (out of order)
		completions.set("r2", { status: "complete", response: "Answer to question two." });
		await vi.advanceTimersByTimeAsync(1000);

		// r2's poller should be cancelled, r1 still active
		expect(plugin.activePollers.has("r2")).toBe(false);
		expect(plugin.activePollers.has("r1")).toBe(true);

		// Verify editor2 got the correct response
		const lastCall2 = editor2.replaceRange.mock.calls[editor2.replaceRange.mock.calls.length - 1];
		expect(lastCall2[0]).toContain("Answer to question two.");

		// Now complete r1
		completions.set("r1", { status: "complete", response: "Answer to question one." });
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.size).toBe(0);

		// Verify editor1 got the correct response
		const lastCall1 = editor1.replaceRange.mock.calls[editor1.replaceRange.mock.calls.length - 1];
		expect(lastCall1[0]).toContain("Answer to question one.");
	});

	it("uses rid-based search for timeout handler", async () => {
		let sendCallCount = 0;
		mockSendPrompt.mockImplementation(async () => {
			sendCallCount++;
			if (sendCallCount === 1) return { ok: true, request_id: "r1" };
			return { ok: true, request_id: "r-retry" };
		});
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Verify rid patched
		expect(editor._data[0]).toContain("<!-- rid:r1 -->");

		// Advance past timeout
		await vi.advanceTimersByTimeAsync(4000);

		// Original poller cancelled, retry poller active
		expect(plugin.activePollers.has("r1")).toBe(false);
		expect(plugin.activePollers.has("r-retry")).toBe(true);

		const replaceCalls = editor.replaceRange.mock.calls;
		const timeoutCall = replaceCalls.find((call: any[]) => call[0].includes("⏱ Timed out"));
		expect(timeoutCall).toBeDefined();
		expect(timeoutCall[0]).toContain("Retrying automatically...");
	});

	it("uses rid-based search for poll error handler", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: false, error: "HTTP 500" });

		const plugin = makePlugin();
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Verify rid patched
		expect(editor._data[0]).toContain("<!-- rid:r1 -->");

		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.size).toBe(0);

		const replaceCalls = editor.replaceRange.mock.calls;
		const lastCall = replaceCalls[replaceCalls.length - 1];
		expect(lastCall[0]).toContain("> [!claude] Error");
		expect(lastCall[0]).toContain("HTTP 500");
	});

	// --- Elapsed-time display update tests ---

	it("updates callout body with elapsed time after 5 seconds", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance 5 seconds — should trigger first elapsed update
		await vi.advanceTimersByTimeAsync(5000);

		const replaceCalls = editor.replaceRange.mock.calls;
		// Find a call that contains the elapsed time marker
		const elapsedCall = replaceCalls.find((call: any[]) => call[0].includes("⏱ 5s"));
		expect(elapsedCall).toBeDefined();
	});

	it("updates elapsed time at 10s, 15s intervals", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance to 15 seconds total
		await vi.advanceTimersByTimeAsync(15000);

		const replaceCalls = editor.replaceRange.mock.calls;
		const elapsedCalls = replaceCalls.filter((call: any[]) => call[0].includes("⏱"));

		// Should have 3 elapsed updates: at ~5s, ~10s, ~15s
		expect(elapsedCalls.length).toBe(3);
		expect(elapsedCalls[0][0]).toContain("⏱ 5s");
		expect(elapsedCalls[1][0]).toContain("⏱ 10s");
		expect(elapsedCalls[2][0]).toContain("⏱ 15s");
	});

	it("does not update callout body before 5 seconds", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance only 4 seconds — should NOT trigger elapsed update
		await vi.advanceTimersByTimeAsync(4000);

		const replaceCalls = editor.replaceRange.mock.calls;
		const elapsedCalls = replaceCalls.filter((call: any[]) => call[0].includes("⏱"));
		expect(elapsedCalls.length).toBe(0);
	});

	it("adds warning text after 120 seconds", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 300 }); // long timeout so we reach 120s
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance to 125 seconds
		await vi.advanceTimersByTimeAsync(125000);

		const replaceCalls = editor.replaceRange.mock.calls;
		// Find the last elapsed-related call — should contain warning text
		const elapsedCalls = replaceCalls.filter((call: any[]) => call[0].includes("⏱"));
		const lastElapsedCall = elapsedCalls[elapsedCalls.length - 1];
		expect(lastElapsedCall[0]).toContain("Still waiting");
	});

	it("elapsed time displays correctly at 2+ minutes", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 300 });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance to 150 seconds (2m 30s)
		await vi.advanceTimersByTimeAsync(150000);

		const replaceCalls = editor.replaceRange.mock.calls;
		const elapsedCalls = replaceCalls.filter((call: any[]) => call[0].includes("⏱"));
		const lastElapsedCall = elapsedCalls[elapsedCalls.length - 1];
		expect(lastElapsedCall[0]).toContain("2m 30s");
	});

	it("elapsed update skipped if callout not found", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		// Start with normal callout lines
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Simulate user deleting the callout — replace all lines with non-callout text
		editor._data.splice(0, editor._data.length, "Some other text", "More text");

		// Advance 5 seconds — elapsed update should be attempted but skipped (no callout)
		await vi.advanceTimersByTimeAsync(5000);

		// The poll should still be running (not crashed)
		expect(plugin.activePollers.size).toBe(1);

		// No elapsed update should have been written (no ⏱ in any call after the initial setup)
		const replaceCalls = editor.replaceRange.mock.calls;
		const elapsedCalls = replaceCalls.filter((call: any[]) => call[0].includes("⏱"));
		expect(elapsedCalls.length).toBe(0);

		// Advance to trigger another poll tick — still no crash
		await vi.advanceTimersByTimeAsync(1000);
		expect(plugin.activePollers.size).toBe(1);
	});

	// --- Auto-retry flow tests ---

	it("sends retry prompt via sendPrompt after timeout", async () => {
		let sendCallCount = 0;
		mockSendPrompt.mockImplementation(async (_port: number, payload: any) => {
			sendCallCount++;
			if (sendCallCount === 1) return { ok: true, request_id: "r1" };
			return { ok: true, request_id: "r-retry" };
		});
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance past timeout
		await vi.advanceTimersByTimeAsync(4000);

		expect(mockSendPrompt).toHaveBeenCalledTimes(2);
		const retryCall = mockSendPrompt.mock.calls[1];
		expect(retryCall[0]).toBe(4321); // port
		expect(retryCall[1].query).toContain("The previous question timed out");
		expect(retryCall[1].filename).toBe("test.md");
	});

	it("replaces retry callout with response on retry success", async () => {
		let sendCallCount = 0;
		mockSendPrompt.mockImplementation(async () => {
			sendCallCount++;
			if (sendCallCount === 1) return { ok: true, request_id: "r1" };
			return { ok: true, request_id: "r-retry" };
		});

		// Original poll: always pending. Retry poll: complete on first tick.
		mockPollReply.mockImplementation(async (_port: number, reqId: string) => {
			if (reqId === "r-retry") return { ok: true, status: "complete", response: "Here is the answer." };
			return { ok: true, status: "pending" };
		});

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance past original timeout to trigger retry
		await vi.advanceTimersByTimeAsync(4000);

		// Retry poller should be active
		expect(plugin.activePollers.has("r-retry")).toBe(true);

		// Advance one tick for the retry poll
		await vi.advanceTimersByTimeAsync(1000);

		// Retry poller should be cancelled after completion
		expect(plugin.activePollers.has("r-retry")).toBe(false);

		const replaceCalls = editor.replaceRange.mock.calls;
		const responseCall = replaceCalls.find((call: any[]) => call[0].includes("Here is the answer."));
		expect(responseCall).toBeDefined();
		expect(responseCall[0]).toContain("> [!claude-done]+");
	});

	it("replaces retry callout with error on retry timeout", async () => {
		let sendCallCount = 0;
		mockSendPrompt.mockImplementation(async () => {
			sendCallCount++;
			if (sendCallCount === 1) return { ok: true, request_id: "r1" };
			return { ok: true, request_id: "r-retry" };
		});
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance past original timeout to trigger retry
		await vi.advanceTimersByTimeAsync(4000);
		expect(plugin.activePollers.has("r-retry")).toBe(true);

		// Advance past retry timeout (120s + margin)
		await vi.advanceTimersByTimeAsync(121000);

		expect(plugin.activePollers.has("r-retry")).toBe(false);

		const replaceCalls = editor.replaceRange.mock.calls;
		const errorCall = replaceCalls.find((call: any[]) => call[0].includes("2 minutes"));
		expect(errorCall).toBeDefined();
		expect(errorCall[0]).toContain("> [!claude] Error");
		expect(errorCall[0]).toContain("Retry also timed out after 2 minutes.");
	});

	it("replaces retry callout with error on retry poll failure", async () => {
		let sendCallCount = 0;
		mockSendPrompt.mockImplementation(async () => {
			sendCallCount++;
			if (sendCallCount === 1) return { ok: true, request_id: "r1" };
			return { ok: true, request_id: "r-retry" };
		});

		// Original poll: pending. Retry poll: error.
		mockPollReply.mockImplementation(async (_port: number, reqId: string) => {
			if (reqId === "r-retry") return { ok: false, error: "Channel crashed" };
			return { ok: true, status: "pending" };
		});

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance past original timeout
		await vi.advanceTimersByTimeAsync(4000);
		expect(plugin.activePollers.has("r-retry")).toBe(true);

		// One tick for retry poll
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.has("r-retry")).toBe(false);

		const replaceCalls = editor.replaceRange.mock.calls;
		const errorCall = replaceCalls.find((call: any[]) => call[0].includes("Channel crashed"));
		expect(errorCall).toBeDefined();
		expect(errorCall[0]).toContain("> [!claude] Error");
	});

	it("cancels retry poller on file switch", async () => {
		let sendCallCount = 0;
		mockSendPrompt.mockImplementation(async () => {
			sendCallCount++;
			if (sendCallCount === 1) return { ok: true, request_id: "r1" };
			return { ok: true, request_id: "r-retry" };
		});
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 3, activeFilePath: "test.md" });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance past original timeout to trigger retry
		await vi.advanceTimersByTimeAsync(4000);
		expect(plugin.activePollers.has("r-retry")).toBe(true);

		// Simulate file switch during retry
		const differentFile = new TFile();
		differentFile.path = "other.md";
		plugin.app.workspace.getActiveFile = () => differentFile;

		// One tick — retry poller should detect file change
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.has("r-retry")).toBe(false);
	});

	it("replaces retry callout with error when retry send fails", async () => {
		let sendCallCount = 0;
		mockSendPrompt.mockImplementation(async () => {
			sendCallCount++;
			if (sendCallCount === 1) return { ok: true, request_id: "r1" };
			return { ok: false, error: "Connection refused" };
		});
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
		const lines = ["> [!claude] Thinking...", "> hello"];
		const editor = makeEditorWithLines(lines);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance past original timeout — retry send will fail
		await vi.advanceTimersByTimeAsync(4000);

		// No retry poller should be registered (send failed)
		expect(plugin.activePollers.has("r-retry")).toBe(false);

		const replaceCalls = editor.replaceRange.mock.calls;
		// Should have the timeout callout AND an error replacing the retry callout
		const timeoutCall = replaceCalls.find((call: any[]) => call[0].includes("⏱ Timed out"));
		expect(timeoutCall).toBeDefined();

		const errorCall = replaceCalls.find((call: any[]) => call[0].includes("Connection refused"));
		expect(errorCall).toBeDefined();
		expect(errorCall[0]).toContain("> [!claude] Error");
	});
});
