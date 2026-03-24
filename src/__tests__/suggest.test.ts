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
import { ClaudeSuggest, retryRequest } from "../suggest";
import { App, Editor, TFile } from "obsidian";

// Track crypto.randomUUID calls with predictable return values
let uuidCounter = 0;
const originalRandomUUID = crypto.randomUUID.bind(crypto);

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

	const pendingRequests = new Map<string, any>();

	return {
		app,
		settings: {
			triggerPhrase: ";;",
			channelPort: overrides?.channelPort ?? 4321,
			pollingTimeoutSecs: overrides?.pollingTimeoutSecs ?? 300,
		},
		lastQuery: null as any,
		activePollers: new Map<string, number>(),
		pendingRequests,
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
		addPendingRequest(requestId: string, query: string, nearLine: number) {
			this.pendingRequests.set(requestId, {
				query,
				startTime: Date.now(),
				status: "thinking",
				nearLine,
			});
			console.log(`Pending request added: ${requestId}`);
		},
		removePendingRequest(requestId: string) {
			this.pendingRequests.delete(requestId);
			console.log(`Pending request removed: ${requestId}`);
		},
		updatePendingRequest(requestId: string, fields: Record<string, any>) {
			const entry = this.pendingRequests.get(requestId);
			if (entry) {
				Object.assign(entry, fields);
				console.log(`Pending request updated: ${requestId} → ${fields.status ?? entry.status}`);
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
		setCursor: vi.fn(),
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
		// Mock crypto.randomUUID to return predictable values
		uuidCounter = 0;
		vi.stubGlobal("crypto", {
			...crypto,
			randomUUID: () => {
				uuidCounter++;
				return `uuid-${uuidCounter}`;
			},
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
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

	// --- Core flow tests ---

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
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);

		// editor.replaceRange: 1. insertion (callout + blank line), 2. error replacement
		expect(editor.replaceRange).toHaveBeenCalledTimes(2);
		const lastCall = editor.replaceRange.mock.calls[1];
		expect(lastCall[0]).toContain("> [!claude] hello");
		expect(lastCall[0]).toContain("⚠️ Connection refused");
	});

	it("replaces callout with response on poll complete", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "complete", response: "Markdown is a markup language." });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

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
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.size).toBe(0);

		const replaceCalls = editor.replaceRange.mock.calls;
		const lastCall = replaceCalls[replaceCalls.length - 1];
		expect(lastCall[0]).toContain("> [!claude] hello");
		expect(lastCall[0]).toContain("⚠️ HTTP 500");
	});

	it("timeout updates pendingRequests to error state instead of auto-retrying", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance past timeout (4000ms > 3000ms)
		await vi.advanceTimersByTimeAsync(4000);

		// Original poller should be cancelled
		expect(plugin.activePollers.has("uuid-1")).toBe(false);

		// Entry should STILL exist in pendingRequests with error state
		expect(plugin.pendingRequests.has("uuid-1")).toBe(true);
		const entry = plugin.pendingRequests.get("uuid-1");
		expect(entry.status).toBe("error");
		expect(entry.retryable).toBe(true);
		expect(entry.errorMessage).toContain("No response after");

		// sendPrompt should have been called only ONCE (no auto-retry)
		expect(mockSendPrompt).toHaveBeenCalledOnce();

		// Error callout should have been written to the editor
		const replaceCalls = editor.replaceRange.mock.calls;
		const errorCall = replaceCalls.find((call: any[]) => call[0].includes("⚠️ No response after"));
		expect(errorCall).toBeDefined();
	});

	it("cancels poller silently when active file changes", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ activeFilePath: "test.md" });
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);

		// Simulate user navigating to a different file
		const differentFile = new TFile();
		differentFile.path = "other.md";
		plugin.app.workspace.getActiveFile = () => differentFile;

		// Advance one tick — poller should detect file change and cancel
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.size).toBe(0);

		// Should NOT have called replaceRange for error/response (only initial insertion)
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
		// Poller is now registered with clientRid (uuid-1), not server's request_id
		expect(plugin.activePollers.has("uuid-1")).toBe(true);
	});

	it("embeds rid in callout header at insertion time (no post-send patching)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		// Before sendPrompt resolves, the callout already has the rid
		// Only 1 replaceRange call (insertion) — no subsequent rid-patching
		expect(editor.replaceRange).toHaveBeenCalledTimes(1);
		const insertCall = editor.replaceRange.mock.calls[0];
		expect(insertCall[0]).toContain("<!-- rid:uuid-1 -->");
		expect(insertCall[0]).toContain("> [!claude] hello");

		await vi.advanceTimersByTimeAsync(0);

		// After sendPrompt resolves — still only 1 replaceRange (no rid patch)
		expect(editor.replaceRange).toHaveBeenCalledTimes(1);
	});

	it("does not patch rid on send failure", async () => {
		mockSendPrompt.mockResolvedValue({ ok: false, error: "Connection refused" });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		await vi.advanceTimersByTimeAsync(0);

		// Call 1: insertion with rid, Call 2: error replacement (no rid in error callout)
		expect(editor.replaceRange).toHaveBeenCalledTimes(2);
		// First call (insertion) contains the rid
		expect(editor.replaceRange.mock.calls[0][0]).toContain("<!-- rid:uuid-1 -->");
		// Error replacement should NOT contain a rid marker
		expect(editor.replaceRange.mock.calls[1][0]).not.toContain("<!-- rid:");
	});

	it("uses rid-based search for poll complete (callout moved away from nearLine)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "complete", response: "The answer." });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		// Flush the send
		await vi.advanceTimersByTimeAsync(0);

		// Verify rid was embedded at insertion time
		expect(editor._data[0]).toContain("<!-- rid:uuid-1 -->");

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
		const editor1 = makeEditorWithLines([";;question one"]);
		callSelectSuggestion(plugin, editor1, "question one");
		await vi.advanceTimersByTimeAsync(0);

		// Verify rid uuid-1 was embedded at insertion
		expect(editor1._data[0]).toContain("<!-- rid:uuid-1 -->");

		// Question 2: different editor (simulating another location)
		const editor2 = makeEditorWithLines([";;question two"]);
		callSelectSuggestion(plugin, editor2, "question two");
		await vi.advanceTimersByTimeAsync(0);

		// Verify rid uuid-2 was embedded at insertion
		expect(editor2._data[0]).toContain("<!-- rid:uuid-2 -->");

		// Both pollers should be active (keyed by client rid)
		expect(plugin.activePollers.size).toBe(2);

		// Complete r2 first (out of order)
		completions.set("r2", { status: "complete", response: "Answer to question two." });
		await vi.advanceTimersByTimeAsync(1000);

		// uuid-2's poller should be cancelled, uuid-1 still active
		expect(plugin.activePollers.has("uuid-2")).toBe(false);
		expect(plugin.activePollers.has("uuid-1")).toBe(true);

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

	it("uses rid-based search for poll error handler", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: false, error: "HTTP 500" });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Verify rid embedded at insertion
		expect(editor._data[0]).toContain("<!-- rid:uuid-1 -->");

		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.activePollers.size).toBe(0);

		const replaceCalls = editor.replaceRange.mock.calls;
		const lastCall = replaceCalls[replaceCalls.length - 1];
		expect(lastCall[0]).toContain("> [!claude] hello");
		expect(lastCall[0]).toContain("⚠️ HTTP 500");
	});

	// --- No file writes during pending state (R023) ---

	it("no replaceCalloutBlock called between insertion and terminal state", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		// Stay pending for a long time
		let pollCount = 0;
		mockPollReply.mockImplementation(async () => {
			pollCount++;
			if (pollCount >= 20) return { ok: true, status: "complete", response: "Done." };
			return { ok: true, status: "pending" };
		});

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Record replaceRange call count after insertion
		const callsAfterInsertion = editor.replaceRange.mock.calls.length;

		// Advance 15 seconds — in the OLD code this would trigger 3 elapsed-time writes
		// In the NEW code, no file writes should happen during pending
		await vi.advanceTimersByTimeAsync(15000);

		// Find any calls with elapsed time markers — should be NONE
		const allCalls = editor.replaceRange.mock.calls;
		const elapsedCalls = allCalls.filter((call: any[]) => call[0].includes("⏱"));
		expect(elapsedCalls.length).toBe(0);

		// The only replaceRange call after insertion should be the terminal state (response)
		const callsAfter15s = allCalls.length;
		// At 15s with 1s polling, pollCount should reach 15. We set complete at 20, so
		// we need to advance further to reach terminal state
		await vi.advanceTimersByTimeAsync(5000);

		// Now terminal state should have fired
		const terminalCalls = editor.replaceRange.mock.calls.slice(callsAfterInsertion);
		expect(terminalCalls.length).toBe(1); // exactly one terminal replacement
		expect(terminalCalls[0][0]).toContain("> [!claude-done]+");
	});

	it("no timer-write or warning state logic runs in poll loop", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 300 });
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance to 125 seconds — in old code this would trigger warning text
		await vi.advanceTimersByTimeAsync(125000);

		const allCalls = editor.replaceRange.mock.calls;
		// No call should contain "Still waiting" or elapsed time markers
		const warningCalls = allCalls.filter((call: any[]) => call[0].includes("Still waiting"));
		expect(warningCalls.length).toBe(0);

		const elapsedCalls = allCalls.filter((call: any[]) => call[0].includes("⏱") && !call[0].includes("Timed out"));
		expect(elapsedCalls.length).toBe(0);
	});

	// --- pendingRequests map lifecycle ---

	it("pendingRequests map populated before insertion and cleaned after terminal state", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "complete", response: "Answer." });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		// Before selectSuggestion — map empty
		expect(plugin.pendingRequests.size).toBe(0);

		callSelectSuggestion(plugin, editor, "hello");

		// After selectSuggestion (synchronous part) — map has entry
		expect(plugin.pendingRequests.size).toBe(1);
		expect(plugin.pendingRequests.has("uuid-1")).toBe(true);
		const entry = plugin.pendingRequests.get("uuid-1");
		expect(entry.query).toBe("hello");
		expect(entry.status).toBe("thinking");
		expect(entry.nearLine).toBe(0);

		// Flush send + poll
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(1000);

		// After terminal state — map cleaned
		expect(plugin.pendingRequests.size).toBe(0);
	});

	it("pendingRequests cleaned on send failure", async () => {
		mockSendPrompt.mockResolvedValue({ ok: false, error: "Connection refused" });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		// Map populated synchronously
		expect(plugin.pendingRequests.size).toBe(1);

		await vi.advanceTimersByTimeAsync(0);

		// Map cleaned after send failure
		expect(plugin.pendingRequests.size).toBe(0);
	});

	it("pendingRequests cleaned on poll error", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: false, error: "HTTP 500" });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");
		expect(plugin.pendingRequests.size).toBe(1);

		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.pendingRequests.size).toBe(0);
	});

	it("pendingRequests stays with error status on timeout", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");
		expect(plugin.pendingRequests.size).toBe(1);

		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(4000);

		// After timeout, entry should STAY with error status (not be removed)
		expect(plugin.pendingRequests.has("uuid-1")).toBe(true);
		const entry = plugin.pendingRequests.get("uuid-1");
		expect(entry.status).toBe("error");
		expect(entry.retryable).toBe(true);
		expect(entry.errorMessage).toContain("No response after");
	});

	it("pendingRequests cleaned on file switch", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ activeFilePath: "test.md" });
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");
		expect(plugin.pendingRequests.size).toBe(1);

		await vi.advanceTimersByTimeAsync(0);

		// Simulate file switch
		const differentFile = new TFile();
		differentFile.path = "other.md";
		plugin.app.workspace.getActiveFile = () => differentFile;

		await vi.advanceTimersByTimeAsync(1000);

		expect(plugin.pendingRequests.size).toBe(0);
	});

	// --- Cursor placement (R030) ---

	it("cursor placed on line after blank line below callout", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		// setCursor should be called with line: start.line + 2 (callout line + blank line)
		expect(editor.setCursor).toHaveBeenCalledOnce();
		expect(editor.setCursor).toHaveBeenCalledWith({ line: 2, ch: 0 });
	});

	it("insertion includes callout header + blank line", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");

		// First replaceRange call is the insertion
		const insertCall = editor.replaceRange.mock.calls[0];
		const insertedText = insertCall[0];
		// Should be: "> [!claude] hello <!-- rid:uuid-1 -->\n\n"
		expect(insertedText).toMatch(/^> \[!claude\] hello <!-- rid:uuid-1 -->\n\n$/);
	});

	// --- Manual retry tests ---

	it("retryRequest sends original query via sendPrompt", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r-new" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		// Set up an error entry in pendingRequests
		plugin.pendingRequests.set("err-1", {
			query: "original question",
			startTime: Date.now(),
			status: "error",
			nearLine: 0,
			errorMessage: "No response after 5m 0s.",
			retryable: true,
		});
		const editor = makeEditorWithLines([
			"> [!claude] original question <!-- rid:err-1 -->",
			"> ⚠️ No response after 5m 0s.",
		]);
		(plugin.app.workspace as any).activeEditor = { editor };

		await retryRequest(plugin as any, "err-1");

		expect(mockSendPrompt).toHaveBeenCalledOnce();
		const call = mockSendPrompt.mock.calls[0];
		expect(call[1].query).toBe("original question");
		// Should NOT contain old retry prompt text
		expect(call[1].query).not.toContain("timed out");
	});

	it("retryRequest creates new pending entry with retryOf link", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r-new" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		plugin.pendingRequests.set("err-1", {
			query: "my question",
			startTime: Date.now(),
			status: "error",
			nearLine: 0,
			errorMessage: "No response.",
			retryable: true,
		});
		const editor = makeEditorWithLines([
			"> [!claude] my question <!-- rid:err-1 -->",
			"> ⚠️ No response.",
		]);
		(plugin.app.workspace as any).activeEditor = { editor };

		await retryRequest(plugin as any, "err-1");

		// Old entry should be removed
		expect(plugin.pendingRequests.has("err-1")).toBe(false);

		// New entry should exist with retryOf
		expect(plugin.pendingRequests.size).toBe(1);
		const [newRid, newEntry] = [...plugin.pendingRequests.entries()][0];
		expect(newEntry.query).toBe("my question");
		expect(newEntry.status).toBe("thinking");
		expect(newEntry.retryOf).toBe("err-1");
	});

	it("retryRequest replaces error callout with new thinking header", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r-new" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		plugin.pendingRequests.set("err-1", {
			query: "my question",
			startTime: Date.now(),
			status: "error",
			nearLine: 0,
			errorMessage: "No response.",
			retryable: true,
		});
		const editor = makeEditorWithLines([
			"> [!claude] my question <!-- rid:err-1 -->",
			"> ⚠️ No response.",
		]);
		(plugin.app.workspace as any).activeEditor = { editor };

		await retryRequest(plugin as any, "err-1");

		// editor.replaceRange should have been called with a new thinking header
		expect(editor.replaceRange).toHaveBeenCalled();
		const replaceCall = editor.replaceRange.mock.calls[0];
		expect(replaceCall[0]).toContain("> [!claude] my question");
		expect(replaceCall[0]).toContain("<!-- rid:");
		// Should be a new rid, not the old one
		expect(replaceCall[0]).not.toContain("rid:err-1");
	});

	it("retryRequest starts new poll loop", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r-new" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin();
		plugin.pendingRequests.set("err-1", {
			query: "my question",
			startTime: Date.now(),
			status: "error",
			nearLine: 0,
			errorMessage: "No response.",
			retryable: true,
		});
		const editor = makeEditorWithLines([
			"> [!claude] my question <!-- rid:err-1 -->",
			"> ⚠️ No response.",
		]);
		(plugin.app.workspace as any).activeEditor = { editor };

		await retryRequest(plugin as any, "err-1");

		// A new poller should be registered
		expect(plugin.activePollers.size).toBe(1);
		const [pollerRid] = [...plugin.activePollers.keys()];
		expect(pollerRid).not.toBe("err-1"); // new rid, not the old one
	});

	it("retryRequest handles send failure gracefully", async () => {
		mockSendPrompt.mockResolvedValue({ ok: false, error: "Connection refused" });

		const plugin = makePlugin();
		plugin.pendingRequests.set("err-1", {
			query: "my question",
			startTime: Date.now(),
			status: "error",
			nearLine: 0,
			errorMessage: "No response.",
			retryable: true,
		});
		const editor = makeEditorWithLines([
			"> [!claude] my question <!-- rid:err-1 -->",
			"> ⚠️ No response.",
		]);
		(plugin.app.workspace as any).activeEditor = { editor };

		await retryRequest(plugin as any, "err-1");

		// Pending entry should be removed (send failed)
		expect(plugin.pendingRequests.size).toBe(0);

		// No poller should be registered
		expect(plugin.activePollers.size).toBe(0);

		// Error callout should have been written
		const replaceCalls = editor.replaceRange.mock.calls;
		const errorCall = replaceCalls.find((call: any[]) => call[0].includes("Connection refused"));
		expect(errorCall).toBeDefined();
	});

	it("retryRequest does nothing if entry is not in error state", async () => {
		const plugin = makePlugin();
		plugin.pendingRequests.set("thinking-1", {
			query: "my question",
			startTime: Date.now(),
			status: "thinking",
			nearLine: 0,
		});

		await retryRequest(plugin as any, "thinking-1");

		// sendPrompt should NOT have been called
		expect(mockSendPrompt).not.toHaveBeenCalled();

		// Entry should still be there, untouched
		expect(plugin.pendingRequests.has("thinking-1")).toBe(true);
	});
});
