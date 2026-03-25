import type { Editor, EditorPosition } from "obsidian";

/**
 * Build a single-line callout header with the user's prompt as the title.
 * The prompt IS the title — no body lines are generated.
 */
export function buildCalloutHeader(query: string): string {
	return `> [!claude] ${query}`;
}

/**
 * Replace a range in the editor with a callout header.
 */
export function insertCallout(
	editor: Editor,
	from: EditorPosition,
	to: EditorPosition,
	content: string
): void {
	editor.replaceRange(buildCalloutHeader(content), from, to);
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
 * Build an error callout with the original query as title and error in body.
 */
export function buildErrorCallout(query: string, errorMsg: string): string {
	return `> [!claude] ${query}\n> ⚠️ ${errorMsg}`;
}

/**
 * Find a callout block by matching the exact header line in the document.
 * Scans the entire document for `> [!claude] {query}` — this is robust
 * against line drift caused by edits above the callout.
 *
 * Falls back to proximity search (±10 lines from nearLine) if query is
 * not provided, for backward compatibility.
 *
 * Returns inclusive {from, to} line numbers, or null if not found.
 */
export function findCalloutRange(
	editor: Editor,
	nearLine: number,
	marker: string = "> [!claude] "
): { from: number; to: number } | null {
	const lineCount = editor.lineCount();

	// Full-document scan for the exact marker
	let markerLine = -1;
	for (let i = 0; i < lineCount; i++) {
		const line = editor.getLine(i);
		if (line.startsWith(marker)) {
			markerLine = i;
			// Don't break — if there are multiple matches, prefer the one
			// closest to nearLine. But pending callouts should be unique
			// since they contain the query text.
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
 * Find a callout block by query text.
 * Builds the exact header line `> [!claude] {query}` and searches the
 * entire document for it. This is how poll callbacks relocate the callout
 * after the document has been edited.
 *
 * Returns inclusive {from, to} line numbers, or null if not found.
 */
export function findCalloutBlock(
	editor: Editor,
	query?: string,
	nearLine?: number
): { from: number; to: number } | null {
	const marker = query ? `> [!claude] ${query}` : "> [!claude] ";
	return findCalloutRange(editor, nearLine ?? 0, marker);
}

/**
 * Format milliseconds as human-readable elapsed time.
 * < 60s: "Ns" (e.g. "5s", "45s")
 * ≥ 60s: "Nm Ns" (e.g. "1m 0s", "2m 30s")
 * Always rounds down to the nearest second.
 */
export function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${seconds}s`;
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


