import { describe, it, expect, vi } from "vitest";
import { buildCalloutText, insertCallout } from "../callout";

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
