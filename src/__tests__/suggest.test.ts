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
import { App, Editor, Notice, TFile } from "obsidian";

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

	return {
		app,
		settings: {
			triggerPhrase: ";;",
			channelPort: overrides?.channelPort ?? 4321,
			pollingTimeoutSecs: overrides?.pollingTimeoutSecs ?? 300,
		},
		lastQuery: null as any,
		activePollers: new Map<string, number>(),
		registerPoller: vi.fn(function (this: any, requestId: string, intervalId: number, _canvasNodeId?: string | null) {
			this.activePollers.set(requestId, intervalId);
		}),
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

	function callSelectSuggestion(
		plugin: ReturnType<typeof makePlugin>,
		editor: any,
		value: string,
		fileOverride?: TFile | null
	) {
		const suggest = new ClaudeSuggest(plugin as any);
		let file: TFile | null;
		if (fileOverride === undefined) {
			file = new TFile();
			file.path = "test.md";
		} else {
			file = fileOverride;
		}

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

	it("falls back to getActiveFile() when context.file is null (canvas case — #7, #8)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ activeFilePath: "My Canvas.canvas" });
		const editor = makeEditorWithLines([";;hello"]);

		// Canvas text nodes give EditorSuggest no backing TFile — context.file is null.
		// The plugin must fall back to workspace.getActiveFile() which returns the .canvas file.
		callSelectSuggestion(plugin, editor, "hello", null);

		await vi.advanceTimersByTimeAsync(0);

		expect(mockSendPrompt).toHaveBeenCalledOnce();
		expect(mockSendPrompt).toHaveBeenCalledWith(4321, {
			filename: "My Canvas.canvas",
			line: 0,
			query: "hello",
		});
	});

	it("sends empty filename when context.file is null AND no active file", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ activeFilePath: null });
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello", null);

		await vi.advanceTimersByTimeAsync(0);

		expect(mockSendPrompt).toHaveBeenCalledWith(4321, {
			filename: "",
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

	it("timeout writes error callout", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const plugin = makePlugin({ pollingTimeoutSecs: 3 });
		const editor = makeEditorWithLines([";;hello"]);

		callSelectSuggestion(plugin, editor, "hello");
		await vi.advanceTimersByTimeAsync(0);

		// Advance past timeout (4000ms > 3000ms)
		await vi.advanceTimersByTimeAsync(4000);

		// Poller should be cancelled
		expect(plugin.activePollers.size).toBe(0);

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

		// Advance 15 seconds — no file writes should happen during pending
		await vi.advanceTimersByTimeAsync(15000);

		// Find any calls with elapsed time markers — should be NONE
		const allCalls = editor.replaceRange.mock.calls;
		const elapsedCalls = allCalls.filter((call: any[]) => call[0].includes("⏱"));
		expect(elapsedCalls.length).toBe(0);

		// Advance further to reach terminal state
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

		// Advance to 125 seconds — should not trigger warning text
		await vi.advanceTimersByTimeAsync(125000);

		const allCalls = editor.replaceRange.mock.calls;
		// No call should contain "Still waiting" or elapsed time markers
		const warningCalls = allCalls.filter((call: any[]) => call[0].includes("Still waiting"));
		expect(warningCalls.length).toBe(0);

		const elapsedCalls = allCalls.filter((call: any[]) => call[0].includes("⏱") && !call[0].includes("Timed out"));
		expect(elapsedCalls.length).toBe(0);
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
		// Should be: "> [!claude] hello\n\n"
		expect(insertedText).toBe("> [!claude] hello\n\n");
	});
});

describe("canvas branch (P16 — D-01, D-03, D-06, D-07, D-09)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockSendPrompt.mockReset();
		mockPollReply.mockReset();
		(Notice as any).reset?.();
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

	function callSelectSuggestion(
		plugin: ReturnType<typeof makePlugin>,
		editor: any,
		value: string,
		fileOverride?: TFile | null,
	) {
		const suggest = new ClaudeSuggest(plugin as any);
		let file: TFile | null;
		if (fileOverride === undefined) {
			file = new TFile();
			file.path = "test.md";
		} else {
			file = fileOverride;
		}
		(suggest as any).context = {
			editor,
			start: { line: 0, ch: 0 },
			end: { line: 0, ch: value.length + 2 },
			query: value,
			file,
		};
		suggest.selectSuggestion(value, {} as MouseEvent);
	}

	function makeCanvasLeafFor(filename: string, query: string, editor: any) {
		const node = {
			id: "node-x",
			child: { editor },
			contentEl: { contains: () => false },
			getData: vi.fn(() => ({
				id: "node-x",
				type: "text",
				text: `> [!claude] ${query}`,
				x: 0,
				y: 0,
				width: 100,
				height: 100,
			})),
			setData: vi.fn(),
		};
		return {
			view: {
				file: { path: filename },
				canvas: {
					nodes: new Map([["node-x", node]]),
					requestSave: vi.fn(),
				},
			},
		};
	}

	it("markdown branch (.md): pollResult.complete writes via replaceCalloutBlock AND does NOT invoke the canvas pipeline (D-06 / D-09 regression guard, checker warning #5)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r1" });
		mockPollReply
			.mockResolvedValueOnce({ ok: true, status: "pending" })
			.mockResolvedValueOnce({ ok: true, status: "complete", response: "MD answer" });

		const plugin = makePlugin({ activeFilePath: "note.md" });
		const editor = makeEditorWithLines([";;hello"]);
		const getLeavesSpy = vi.fn(() => [] as any[]);
		plugin.app.workspace.getLeavesOfType = getLeavesSpy;

		callSelectSuggestion(plugin, editor, "hello", null);
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);

		const calls = (editor.replaceRange as any).mock.calls;
		const responseCall = calls.find((c: any[]) =>
			typeof c[0] === "string" && c[0].includes("[!claude-done]+ hello"));
		expect(responseCall).toBeDefined();
		expect(responseCall[0]).toContain("MD answer");

		// REGRESSION GUARD (checker #5): canvas pipeline must NOT have been invoked.
		expect(getLeavesSpy).not.toHaveBeenCalled();
	});

	it("canvas branch (.canvas) success: probe matches, reply dispatches through Canvas API; replaceCalloutBlock NOT used (D-09)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r2" });
		mockPollReply
			.mockResolvedValueOnce({ ok: true, status: "pending" })
			.mockResolvedValueOnce({ ok: true, status: "complete", response: "Canvas answer" });

		const editor = makeEditorWithLines([";;q"]);
		const plugin = makePlugin({ activeFilePath: "My.canvas" });
		const canvasMock = makeCanvasLeafFor("My.canvas", "q", editor);
		plugin.app.workspace.getLeavesOfType = vi.fn(() => [canvasMock as any]);

		callSelectSuggestion(plugin, editor, "q", null);
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);
		// Allow microtasks for the async deliverCanvasReply call to settle.
		await Promise.resolve();
		await Promise.resolve();

		const setDataMock = canvasMock.view.canvas.nodes.get("node-x")!.setData;
		expect(setDataMock).toHaveBeenCalled();
		const arg = (setDataMock as any).mock.calls[(setDataMock as any).mock.calls.length - 1][0];
		expect(arg.text).toContain("Canvas answer");
		expect(arg.text).toContain("[!claude-done]+ q");

		// editor.replaceRange must NOT have been used for the response callout.
		const calls = (editor.replaceRange as any).mock.calls;
		const responseCall = calls.find((c: any[]) =>
			typeof c[0] === "string" && c[0].includes("[!claude-done]+ q"));
		expect(responseCall).toBeUndefined();
	});

	it("canvas trigger with no matching node logs console.warn and proceeds with canvasNodeId null (D-03)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r3" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const editor = makeEditorWithLines([";;q"]);
		const plugin = makePlugin({ activeFilePath: "Other.canvas" });
		plugin.app.workspace.getLeavesOfType = vi.fn(() => [] as any[]); // no canvas leaves

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		callSelectSuggestion(plugin, editor, "q", null);
		await vi.advanceTimersByTimeAsync(0);

		expect(warnSpy).toHaveBeenCalled();
		const warnArg = warnSpy.mock.calls[0][0];
		expect(String(warnArg)).toContain("Other.canvas");
		expect(String(warnArg)).toContain("Falling back to query-text matching");

		expect(plugin.registerPoller).toHaveBeenCalled();
		const args = (plugin.registerPoller as any).mock.calls[0];
		expect(args[2] === null || args[2] === undefined).toBe(true);

		warnSpy.mockRestore();
	});

	it("canvas branch send-failure: error callout written via Canvas API, NOT via replaceCalloutBlock; Notice + console.error fired (D-07 send-fail)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: false, error: "channel down" });

		const editor = makeEditorWithLines([";;q"]);
		const plugin = makePlugin({ activeFilePath: "My.canvas" });
		const canvasMock = makeCanvasLeafFor("My.canvas", "q", editor);
		plugin.app.workspace.getLeavesOfType = vi.fn(() => [canvasMock as any]);
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		callSelectSuggestion(plugin, editor, "q", null);
		await vi.advanceTimersByTimeAsync(0);
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		const setDataMock = canvasMock.view.canvas.nodes.get("node-x")!.setData;
		expect(setDataMock).toHaveBeenCalled();
		const arg = (setDataMock as any).mock.calls[(setDataMock as any).mock.calls.length - 1][0];
		expect(arg.text).toContain("channel down");
		expect(arg.text).toContain("[!claude] q");

		// editor.replaceRange must NOT have been used for the error callout body.
		const calls = (editor.replaceRange as any).mock.calls;
		const errCall = calls.find((c: any[]) =>
			typeof c[0] === "string" && c[0].includes("channel down"));
		expect(errCall).toBeUndefined();

		expect((Notice as any).instances.length).toBeGreaterThan(0);
		expect(errSpy).toHaveBeenCalled();
		errSpy.mockRestore();
	});

	it("canvas branch poll-error: error callout written via Canvas API, NOT via replaceCalloutBlock; Notice + console.error fired (D-07 poll-error)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r5" });
		mockPollReply
			.mockResolvedValueOnce({ ok: true, status: "pending" })
			.mockResolvedValueOnce({ ok: false, error: "5xx from server" });

		const editor = makeEditorWithLines([";;q"]);
		const plugin = makePlugin({ activeFilePath: "My.canvas" });
		const canvasMock = makeCanvasLeafFor("My.canvas", "q", editor);
		plugin.app.workspace.getLeavesOfType = vi.fn(() => [canvasMock as any]);
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		callSelectSuggestion(plugin, editor, "q", null);
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);
		await Promise.resolve();
		await Promise.resolve();

		const setDataMock = canvasMock.view.canvas.nodes.get("node-x")!.setData;
		expect(setDataMock).toHaveBeenCalled();
		const arg = (setDataMock as any).mock.calls[(setDataMock as any).mock.calls.length - 1][0];
		expect(arg.text).toContain("5xx from server");

		const calls = (editor.replaceRange as any).mock.calls;
		const errCall = calls.find((c: any[]) =>
			typeof c[0] === "string" && c[0].includes("5xx from server"));
		expect(errCall).toBeUndefined();

		expect((Notice as any).instances.length).toBeGreaterThan(0);
		expect(errSpy).toHaveBeenCalled();
		errSpy.mockRestore();
	});

	it("canvas branch timeout: error callout written via Canvas API, NOT via replaceCalloutBlock; Notice + console.error fired (D-07 timeout)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r6" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const editor = makeEditorWithLines([";;q"]);
		const plugin = makePlugin({ activeFilePath: "My.canvas", pollingTimeoutSecs: 1 });
		const canvasMock = makeCanvasLeafFor("My.canvas", "q", editor);
		plugin.app.workspace.getLeavesOfType = vi.fn(() => [canvasMock as any]);
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		callSelectSuggestion(plugin, editor, "q", null);
		await vi.advanceTimersByTimeAsync(0);
		// Advance well past the 1-second timeout.
		for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000);
		await Promise.resolve();
		await Promise.resolve();

		const setDataMock = canvasMock.view.canvas.nodes.get("node-x")!.setData;
		expect(setDataMock).toHaveBeenCalled();
		const arg = (setDataMock as any).mock.calls[(setDataMock as any).mock.calls.length - 1][0];
		expect(arg.text).toContain("No response after");

		const calls = (editor.replaceRange as any).mock.calls;
		const errCall = calls.find((c: any[]) =>
			typeof c[0] === "string" && c[0].includes("No response after"));
		expect(errCall).toBeUndefined();

		expect((Notice as any).instances.length).toBeGreaterThan(0);
		expect(errSpy).toHaveBeenCalled();
		errSpy.mockRestore();
	});

	it("canvas branch survives file-change mid-poll: poller is NOT cancelled when activeFile changes (Wave 4 manual-E2E gap fix)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r-fc-canvas" });
		mockPollReply
			.mockResolvedValueOnce({ ok: true, status: "pending" })
			.mockResolvedValueOnce({ ok: true, status: "complete", response: "delivered after focus shift" });

		const editor = makeEditorWithLines([";;q"]);
		const plugin = makePlugin({ activeFilePath: "My.canvas" });
		const canvasMock = makeCanvasLeafFor("My.canvas", "q", editor);
		plugin.app.workspace.getLeavesOfType = vi.fn(() => [canvasMock as any]);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		callSelectSuggestion(plugin, editor, "q", null);
		await vi.advanceTimersByTimeAsync(0);

		// Simulate user clicking into a different leaf mid-poll.
		const otherFile = new TFile();
		otherFile.path = "annotated-reader/annotated-reader.md";
		plugin.app.workspace.getActiveFile = () => otherFile;

		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);
		await Promise.resolve();
		await Promise.resolve();

		const fileChangeCancellation = logSpy.mock.calls.find(([msg]) =>
			typeof msg === "string" && msg.startsWith("File changed"));
		expect(fileChangeCancellation).toBeUndefined();

		const setDataMock = canvasMock.view.canvas.nodes.get("node-x")!.setData;
		expect(setDataMock).toHaveBeenCalled();
		const arg = (setDataMock as any).mock.calls[(setDataMock as any).mock.calls.length - 1][0];
		expect(arg.text).toContain("delivered after focus shift");

		logSpy.mockRestore();
	});

	it("markdown branch still cancels on file-change (D-06 regression guard for the canvas-only fix)", async () => {
		mockSendPrompt.mockResolvedValue({ ok: true, request_id: "r-fc-md" });
		mockPollReply.mockResolvedValue({ ok: true, status: "pending" });

		const editor = makeEditorWithLines([";;hello"]);
		const plugin = makePlugin({ activeFilePath: "note.md" });
		plugin.app.workspace.getLeavesOfType = vi.fn(() => [] as any[]);
		const cancelSpy = vi.spyOn(plugin, "cancelPoller");

		callSelectSuggestion(plugin, editor, "hello", null);
		await vi.advanceTimersByTimeAsync(0);

		const otherFile = new TFile();
		otherFile.path = "other.md";
		plugin.app.workspace.getActiveFile = () => otherFile;

		await vi.advanceTimersByTimeAsync(1000);

		expect(cancelSpy).toHaveBeenCalled();
	});
});
