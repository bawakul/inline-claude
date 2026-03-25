import { describe, it, expect, vi } from "vitest";
import {
	buildCalloutHeader,
	insertCallout,
	buildResponseCallout,
	buildErrorCallout,
	findCalloutRange,
	findCalloutBlock,
	replaceCalloutBlock,
	formatElapsed,
} from "../callout";

describe("buildCalloutHeader", () => {
	it("formats query as the callout title", () => {
		expect(buildCalloutHeader("hello")).toBe(
			"> [!claude] hello"
		);
	});

	it("handles multi-line query (flattened into title)", () => {
		expect(buildCalloutHeader("line1\nline2")).toBe(
			"> [!claude] line1\nline2"
		);
	});

	it("handles empty query", () => {
		expect(buildCalloutHeader("")).toBe("> [!claude] ");
	});

	it("handles content with leading/trailing whitespace", () => {
		expect(buildCalloutHeader("  spaced  ")).toBe(
			"> [!claude]   spaced  "
		);
	});
});

describe("insertCallout", () => {
	it("calls editor.replaceRange with callout header", () => {
		const replaceRange = vi.fn();
		const editor = { replaceRange } as any;
		const from = { line: 0, ch: 0 };
		const to = { line: 0, ch: 7 };

		insertCallout(editor, from, to, "hello");

		expect(replaceRange).toHaveBeenCalledOnce();
		expect(replaceRange).toHaveBeenCalledWith(
			"> [!claude] hello",
			from,
			to
		);
	});
});

describe("buildResponseCallout", () => {
	it("formats single-line response", () => {
		const result = buildResponseCallout("What is X?", "X is a thing.");
		expect(result).toBe(
			"> [!claude-done]+ What is X?\n> **Claude:** X is a thing."
		);
	});

	it("formats multi-line response", () => {
		const result = buildResponseCallout("Tell me", "Line 1\nLine 2\nLine 3");
		expect(result).toBe(
			"> [!claude-done]+ Tell me\n> **Claude:** Line 1\n> Line 2\n> Line 3"
		);
	});

	it("handles empty response", () => {
		const result = buildResponseCallout("Hello?", "");
		expect(result).toBe("> [!claude-done]+ Hello?\n> **Claude:** ");
	});
});

describe("buildErrorCallout", () => {
	it("formats error with query as title", () => {
		const result = buildErrorCallout("What is X?", "Connection refused");
		expect(result).toBe(
			"> [!claude] What is X?\n> ⚠️ Connection refused"
		);
	});
});

describe("findCalloutRange", () => {
	function makeEditor(lines: string[]) {
		return {
			lineCount: () => lines.length,
			getLine: (n: number) => lines[n] ?? "",
		} as any;
	}

	it("finds callout at exact line", () => {
		const lines = [
			"Some text",
			"> [!claude] Thinking...",
			"> content line",
			"",
		];
		const result = findCalloutRange(makeEditor(lines), 1);
		expect(result).toEqual({ from: 1, to: 2 });
	});

	it("finds callout shifted +5 lines from nearLine", () => {
		const lines = [
			"line 0",
			"line 1",
			"line 2",
			"line 3",
			"line 4",
			"line 5",
			"> [!claude] Thinking...",
			"> response here",
			"",
		];
		const result = findCalloutRange(makeEditor(lines), 1);
		expect(result).toEqual({ from: 6, to: 7 });
	});

	it("finds callout shifted -5 lines from nearLine", () => {
		const lines = [
			"> [!claude] Thinking...",
			"> some content",
			"",
			"line 3",
			"line 4",
			"line 5",
		];
		const result = findCalloutRange(makeEditor(lines), 5);
		expect(result).toEqual({ from: 0, to: 1 });
	});

	it("returns null when no callout in range", () => {
		const lines = ["no callout here", "just text", "more text"];
		const result = findCalloutRange(makeEditor(lines), 1);
		expect(result).toBeNull();
	});

	it("stops at block boundary", () => {
		const lines = [
			"> [!claude] Thinking...",
			"> line 1",
			"> line 2",
			"not a callout line",
			"> different block",
		];
		const result = findCalloutRange(makeEditor(lines), 0);
		expect(result).toEqual({ from: 0, to: 2 });
	});

	it("handles single-line callout (header only)", () => {
		const lines = [
			"> [!claude] Thinking...",
			"not a continuation",
		];
		const result = findCalloutRange(makeEditor(lines), 0);
		expect(result).toEqual({ from: 0, to: 0 });
	});
});

describe("findCalloutBlock", () => {
	function makeEditor(lines: string[]) {
		return {
			lineCount: () => lines.length,
			getLine: (n: number) => lines[n] ?? "",
		} as any;
	}

	it("uses proximity search when nearLine is provided", () => {
		const lines = [
			"> [!claude] Thinking...",
			"> some content",
			"",
		];
		const result = findCalloutBlock(makeEditor(lines), undefined, 0);
		expect(result).toEqual({ from: 0, to: 1 });
	});

	it("returns null when no nearLine and no callout found", () => {
		const lines = ["no callout here", "just text"];
		const result = findCalloutBlock(makeEditor(lines), undefined, 50);
		expect(result).toBeNull();
	});

	it("returns null when called with no nearLine", () => {
		const lines = [
			"> [!claude] Thinking...",
			"> content",
		];
		const result = findCalloutBlock(makeEditor(lines));
		expect(result).toBeNull();
	});
});

describe("replaceCalloutBlock", () => {
	it("calls replaceRange with correct positions", () => {
		const replaceRange = vi.fn();
		const getLine = vi.fn().mockReturnValue("> some content");
		const editor = { replaceRange, getLine } as any;

		replaceCalloutBlock(editor, 2, 4, "> [!claude]+\n> new content");

		expect(replaceRange).toHaveBeenCalledOnce();
		expect(replaceRange).toHaveBeenCalledWith(
			"> [!claude]+\n> new content",
			{ line: 2, ch: 0 },
			{ line: 4, ch: 14 } // "> some content".length === 14
		);
	});

	it("reads the actual last line length for to position", () => {
		const replaceRange = vi.fn();
		const getLine = vi.fn().mockReturnValue("> short");
		const editor = { replaceRange, getLine } as any;

		replaceCalloutBlock(editor, 0, 0, "replacement");

		expect(getLine).toHaveBeenCalledWith(0);
		expect(replaceRange).toHaveBeenCalledWith(
			"replacement",
			{ line: 0, ch: 0 },
			{ line: 0, ch: 7 } // "> short".length === 7
		);
	});
});

describe("formatElapsed", () => {
	it("formats 0ms as 0s", () => {
		expect(formatElapsed(0)).toBe("0s");
	});

	it("formats 5000ms as 5s", () => {
		expect(formatElapsed(5000)).toBe("5s");
	});

	it("formats 45000ms as 45s", () => {
		expect(formatElapsed(45000)).toBe("45s");
	});

	it("rounds down to nearest second (59999ms → 59s)", () => {
		expect(formatElapsed(59999)).toBe("59s");
	});

	it("formats 60000ms as 1m 0s", () => {
		expect(formatElapsed(60000)).toBe("1m 0s");
	});

	it("formats 90000ms as 1m 30s", () => {
		expect(formatElapsed(90000)).toBe("1m 30s");
	});

	it("formats 150000ms as 2m 30s", () => {
		expect(formatElapsed(150000)).toBe("2m 30s");
	});

	it("formats 300000ms as 5m 0s", () => {
		expect(formatElapsed(300000)).toBe("5m 0s");
	});
});
