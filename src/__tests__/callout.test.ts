import { describe, it, expect, vi } from "vitest";
import {
	buildCalloutText,
	insertCallout,
	buildResponseCallout,
	buildErrorCallout,
	findCalloutRange,
	findCalloutRangeById,
	findCalloutBlock,
	replaceCalloutBlock,
	formatElapsed,
	buildThinkingBody,
	RETRY_PROMPT,
	buildTimeoutCallout,
	buildRetryThinkingCallout,
} from "../callout";

describe("buildCalloutText", () => {
	it("formats single-line content", () => {
		expect(buildCalloutText("hello")).toBe(
			"> [!claude] Thinking...\n> hello"
		);
	});

	it("formats multi-line content with each line prefixed", () => {
		expect(buildCalloutText("line1\nline2")).toBe(
			"> [!claude] Thinking...\n> line1\n> line2"
		);
	});

	it("returns just the header for empty content", () => {
		expect(buildCalloutText("")).toBe("> [!claude] Thinking...");
	});

	it("handles content with leading/trailing whitespace", () => {
		expect(buildCalloutText("  spaced  ")).toBe(
			"> [!claude] Thinking...\n>   spaced  "
		);
	});

	it("handles three lines", () => {
		expect(buildCalloutText("a\nb\nc")).toBe(
			"> [!claude] Thinking...\n> a\n> b\n> c"
		);
	});

	it("embeds rid marker in header when requestId is provided", () => {
		expect(buildCalloutText("hello", "some-uuid")).toBe(
			"> [!claude] Thinking... <!-- rid:some-uuid -->\n> hello"
		);
	});

	it("embeds rid marker in header-only callout (empty content)", () => {
		expect(buildCalloutText("", "abc-123")).toBe(
			"> [!claude] Thinking... <!-- rid:abc-123 -->"
		);
	});

	it("produces unchanged output when requestId is undefined", () => {
		expect(buildCalloutText("content")).toBe(
			"> [!claude] Thinking...\n> content"
		);
	});
});

describe("insertCallout", () => {
	it("calls editor.replaceRange with callout text", () => {
		const replaceRange = vi.fn();
		const editor = { replaceRange } as any;
		const from = { line: 0, ch: 0 };
		const to = { line: 0, ch: 7 };

		insertCallout(editor, from, to, "hello");

		expect(replaceRange).toHaveBeenCalledOnce();
		expect(replaceRange).toHaveBeenCalledWith(
			"> [!claude] Thinking...\n> hello",
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
	it("formats error message correctly", () => {
		const result = buildErrorCallout("What is X?", "Connection refused");
		expect(result).toBe(
			"> [!claude] Error\n> **Q:** What is X?\n>\n> ⚠️ Connection refused"
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

describe("buildThinkingBody", () => {
	it("returns same as buildCalloutText when no elapsed is provided", () => {
		const query = "What is Obsidian?";
		expect(buildThinkingBody(query)).toBe(buildCalloutText(query));
	});

	it("appends elapsed line when elapsedMs ≥ 5000", () => {
		expect(buildThinkingBody("test query", 15000)).toBe(
			"> [!claude] Thinking...\n> test query\n> ⏱ 15s"
		);
	});

	it("appends elapsed line with warning text when warning is true", () => {
		expect(buildThinkingBody("test query", 130000, true)).toBe(
			"> [!claude] Thinking...\n> test query\n> ⏱ 2m 10s — Still waiting. Claude may need input in the terminal."
		);
	});

	it("omits elapsed line when elapsedMs < 5000", () => {
		const query = "short wait";
		expect(buildThinkingBody(query, 3000)).toBe(buildCalloutText(query));
	});

	it("handles multi-line query with elapsed", () => {
		const query = "line one\nline two";
		expect(buildThinkingBody(query, 10000)).toBe(
			"> [!claude] Thinking...\n> line one\n> line two\n> ⏱ 10s"
		);
	});
});

describe("RETRY_PROMPT", () => {
	it("is a non-empty string", () => {
		expect(typeof RETRY_PROMPT).toBe("string");
		expect(RETRY_PROMPT.length).toBeGreaterThan(0);
	});

	it("contains expected key phrases", () => {
		expect(RETRY_PROMPT).toContain("timed out");
		expect(RETRY_PROMPT).toContain("respond");
	});
});

describe("buildTimeoutCallout", () => {
	it("formats single-line query with correct elapsed time (300s → 5m 0s)", () => {
		const result = buildTimeoutCallout("What is markdown?", 300000);
		expect(result).toBe(
			"> [!claude] ⏱ Timed out\n> What is markdown?\n> Waited 5m 0s. Retrying automatically..."
		);
	});

	it("handles multi-line query — each line is prefixed with >", () => {
		const result = buildTimeoutCallout("Multi\nline query", 120000);
		expect(result).toBe(
			"> [!claude] ⏱ Timed out\n> Multi\n> line query\n> Waited 2m 0s. Retrying automatically..."
		);
	});

	it("formats sub-minute elapsed time", () => {
		const result = buildTimeoutCallout("Quick q", 45000);
		expect(result).toBe(
			"> [!claude] ⏱ Timed out\n> Quick q\n> Waited 45s. Retrying automatically..."
		);
	});

	it("handles empty query", () => {
		const result = buildTimeoutCallout("", 60000);
		expect(result).toBe(
			"> [!claude] ⏱ Timed out\n> \n> Waited 1m 0s. Retrying automatically..."
		);
	});
});

describe("buildRetryThinkingCallout", () => {
	it("produces correct format with retry prefix", () => {
		const result = buildRetryThinkingCallout();
		expect(result).toBe(
			`> [!claude] Thinking...\n> (Retry) ${RETRY_PROMPT}`
		);
	});

	it("starts with standard Thinking header", () => {
		expect(buildRetryThinkingCallout()).toMatch(/^> \[!claude\] Thinking\.\.\./);
	});

	it("includes (Retry) marker in body", () => {
		expect(buildRetryThinkingCallout()).toContain("> (Retry)");
	});
});
