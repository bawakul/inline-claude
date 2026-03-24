import { describe, it, expect, vi } from "vitest";
import {
	buildCalloutText,
	insertCallout,
	buildResponseCallout,
	buildErrorCallout,
	findCalloutRange,
	replaceCalloutBlock,
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
