import type { Editor, EditorPosition } from "obsidian";

/**
 * Build a callout block from user content.
 * Multi-line content gets each line prefixed with `> `.
 * Empty content returns just the header.
 */
export function buildCalloutText(content: string): string {
	const header = "> [!claude] Thinking...";
	if (content === "") {
		return header;
	}
	const lines = content.split("\n");
	const prefixed = lines.map((line) => `> ${line}`).join("\n");
	return `${header}\n${prefixed}`;
}

/**
 * Replace a range in the editor with a callout block.
 */
export function insertCallout(
	editor: Editor,
	from: EditorPosition,
	to: EditorPosition,
	content: string
): void {
	editor.replaceRange(buildCalloutText(content), from, to);
}

/**
 * Build a response callout with the original query and Claude's response.
 * The `+` makes it collapsible in Obsidian.
 */
export function buildResponseCallout(query: string, response: string): string {
	const header = `> [!claude-done]+ ${query}`;
	if (response === "") {
		return `${header}\n> **Claude:** `;
	}
	const responseLines = response
		.split("\n")
		.map((line, i) => i === 0 ? `> **Claude:** ${line}` : `> ${line}`)
		.join("\n");
	return `${header}\n${responseLines}`;
}

/**
 * Build an error callout with the original query and error message.
 */
export function buildErrorCallout(query: string, errorMsg: string): string {
	const header = "> [!claude] Error";
	const queryLine = `> **Q:** ${query}`;
	const separator = ">";
	const errorLine = `> ⚠️ ${errorMsg}`;
	return `${header}\n${queryLine}\n${separator}\n${errorLine}`;
}

/**
 * Find the line range of a callout block near a given line.
 * Scans ±10 lines from nearLine looking for a line starting with marker.
 * Once found, scans forward to find the end of the blockquote (first line
 * not starting with `> ` or end of document).
 * Returns inclusive {from, to} line numbers, or null if not found.
 */
export function findCalloutRange(
	editor: Editor,
	nearLine: number,
	marker: string = "> [!claude] Thinking..."
): { from: number; to: number } | null {
	const lineCount = editor.lineCount();
	const searchStart = Math.max(0, nearLine - 10);
	const searchEnd = Math.min(lineCount - 1, nearLine + 10);

	let markerLine = -1;
	for (let i = searchStart; i <= searchEnd; i++) {
		const line = editor.getLine(i);
		if (line.startsWith(marker)) {
			markerLine = i;
			break;
		}
	}

	if (markerLine === -1) {
		return null;
	}

	// Scan forward from the marker line to find the end of the callout block.
	// A callout block continues as long as lines start with `>`.
	let endLine = markerLine;
	for (let i = markerLine + 1; i < lineCount; i++) {
		const line = editor.getLine(i);
		if (line.startsWith(">")) {
			endLine = i;
		} else {
			break;
		}
	}

	return { from: markerLine, to: endLine };
}

/**
 * Replace lines from..to (inclusive) with new content.
 */
export function replaceCalloutBlock(
	editor: Editor,
	from: number,
	to: number,
	newContent: string
): void {
	const fromPos: EditorPosition = { line: from, ch: 0 };
	const toPos: EditorPosition = {
		line: to,
		ch: editor.getLine(to).length,
	};
	editor.replaceRange(newContent, fromPos, toPos);
}
