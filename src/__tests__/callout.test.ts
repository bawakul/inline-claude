import { describe, it, expect, vi } from "vitest";
import {
	buildCalloutHeader,
	insertCallout,
	buildResponseCallout,
	buildErrorCallout,
	findCalloutRange,
	findCalloutRangeById,
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

	it("embeds rid marker when requestId is provided", () => {
		expect(buildCalloutHeader("hello", "some-uuid")).toBe(
			"> [!claude] hello <!-- rid:some-uuid -->"
		);
	});

	it("embeds rid marker with empty query", () => {
		expect(buildCalloutHeader("", "abc-123")).toBe(
			"> [!claude]  <!-- rid:abc-123 -->"
		);
	});

	it("produces unchanged output when requestId is undefined", () => {
		expect(buildCalloutHeader("content")).toBe(
			"> [!claude] content"
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

	it("embeds rid when requestId is provided", () => {
		const replaceRange = vi.fn();
		const editor = { replaceRange } as any;
		const from = { line: 0, ch: 0 };
		const to = { line: 0, ch: 7 };

		insertCallout(editor, from, to, "hello", "test-uuid");

		expect(replaceRange).toHaveBeenCalledWith(
			"> [!claude] hello <!-- rid:test-uuid -->",
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

describe("findCalloutRangeById", () => {
	function makeEditor(lines: string[]) {
		return {
			lineCount: () => lines.length,
			getLine: (n: number) => lines[n] ?? "",
		} as any;
	}

	it("finds callout by rid at any position in document", () => {
		const lines = [
			"Some preamble",
			"More text",
			"Even more text",
			"> [!claude] Thinking... <!-- rid:abc-123 -->",
			"> question content",
			"",
			"Trailing text",
		];
		const result = findCalloutRangeById(makeEditor(lines), "abc-123");
		expect(result).toEqual({ from: 3, to: 4 });
	});

	it("returns null when rid is not present", () => {
		const lines = [
			"> [!claude] Thinking...",
			"> no rid here",
			"other text",
		];
		const result = findCalloutRangeById(makeEditor(lines), "nonexistent");
		expect(result).toBeNull();
	});

	it("correctly identifies block boundaries (stops at non-> line)", () => {
		const lines = [
			"> [!claude] Thinking... <!-- rid:uuid-1 -->",
			"> line 1",
			"> line 2",
			"> line 3",
			"not part of callout",
			"> different block",
		];
		const result = findCalloutRangeById(makeEditor(lines), "uuid-1");
		expect(result).toEqual({ from: 0, to: 3 });
	});

	it("handles single-line callout (header only, no body)", () => {
		const lines = [
			"> [!claude] Thinking... <!-- rid:solo -->",
			"regular text",
		];
		const result = findCalloutRangeById(makeEditor(lines), "solo");
		expect(result).toEqual({ from: 0, to: 0 });
	});

	it("finds callout far from beginning of document (beyond ±10 range)", () => {
		// 25 lines of filler, then the callout at line 25
		const lines = Array.from({ length: 25 }, (_, i) => `filler line ${i}`);
		lines.push("> [!claude] Thinking... <!-- rid:far-away -->");
		lines.push("> content");
		lines.push("");
		const result = findCalloutRangeById(makeEditor(lines), "far-away");
		expect(result).toEqual({ from: 25, to: 26 });
	});

	it("multi-callout: two different IDs, each resolved correctly", () => {
		const lines = [
			"> [!claude] Thinking... <!-- rid:first-id -->",
			"> question one",
			"",
			"Some text between",
			"",
			"> [!claude] Thinking... <!-- rid:second-id -->",
			"> question two",
			"> more of question two",
			"",
		];
		const editor = makeEditor(lines);

		const first = findCalloutRangeById(editor, "first-id");
		expect(first).toEqual({ from: 0, to: 1 });

		const second = findCalloutRangeById(editor, "second-id");
		expect(second).toEqual({ from: 5, to: 7 });
	});
});

describe("findCalloutBlock", () => {
	function makeEditor(lines: string[]) {
		return {
			lineCount: () => lines.length,
			getLine: (n: number) => lines[n] ?? "",
		} as any;
	}

	it("uses ID-based search when requestId is provided and found", () => {
		const lines = [
			"filler",
			"> [!claude] Thinking... <!-- rid:target -->",
			"> content",
			"",
		];
		const result = findCalloutBlock(makeEditor(lines), "target");
		expect(result).toEqual({ from: 1, to: 2 });
	});

	it("falls back to proximity when requestId is provided but not found (legacy callout)", () => {
		const lines = [
			"> [!claude] Thinking...",
			"> legacy content without rid",
			"",
		];
		// requestId won't match, but nearLine 0 will find the proximity callout
		const result = findCalloutBlock(makeEditor(lines), "missing-id", 0);
		expect(result).toEqual({ from: 0, to: 1 });
	});

	it("uses proximity only when no requestId is provided", () => {
		const lines = [
			"> [!claude] Thinking...",
			"> some content",
			"",
		];
		const result = findCalloutBlock(makeEditor(lines), undefined, 0);
		expect(result).toEqual({ from: 0, to: 1 });
	});

	it("returns null when neither ID nor proximity finds anything", () => {
		const lines = ["no callout here", "just text"];
		const result = findCalloutBlock(makeEditor(lines), "nope", 50);
		expect(result).toBeNull();
	});

	it("returns null when called with no requestId and no nearLine", () => {
		const lines = [
			"> [!claude] Thinking...",
			"> content",
		];
		const result = findCalloutBlock(makeEditor(lines));
		expect(result).toBeNull();
	});

	it("prefers ID match over proximity when both could match different callouts", () => {
		const lines = [
			"> [!claude] Thinking...",
			"> proximity would find this one",
			"",
			"gap text",
			"",
			"> [!claude] Thinking... <!-- rid:specific -->",
			"> this is the one we want",
			"",
		];
		// nearLine=0 would find the first callout via proximity,
		// but requestId should find the second one by ID
		const result = findCalloutBlock(makeEditor(lines), "specific", 0);
		expect(result).toEqual({ from: 5, to: 6 });
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


