import type { Editor, EditorPosition } from "obsidian";

/**
 * Build a single-line callout header with the user's prompt as the title.
 * The prompt IS the title — no body lines are generated.
 * When requestId is provided, a `<!-- rid:UUID -->` marker is appended
 * to the header line for ID-based callout matching.
 */
export function buildCalloutHeader(query: string, requestId?: string): string {
	const rid = requestId ? ` <!-- rid:${requestId} -->` : "";
	return `> [!claude] ${query}${rid}`;
}

/**
 * Replace a range in the editor with a callout header.
 * When requestId is provided, it's embedded as a rid marker in the header.
 */
export function insertCallout(
	editor: Editor,
	from: EditorPosition,
	to: EditorPosition,
	content: string,
	requestId?: string
): void {
	editor.replaceRange(buildCalloutHeader(content, requestId), from, to);
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
 * Find the line range of a callout block near a given line.
 * Scans ±10 lines from nearLine looking for a line starting with marker.
 * Once found, scans forward to find the end of the blockquote (first line
 * not starting with `> ` or end of document).
 * Returns inclusive {from, to} line numbers, or null if not found.
 */
export function findCalloutRange(
	editor: Editor,
	nearLine: number,
	marker: string = "> [!claude] "
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
 * Find a callout block by its embedded request ID (`<!-- rid:UUID -->`).
 * Scans ALL lines in the document (not limited to ±10 like proximity search).
 * Returns inclusive {from, to} line numbers, or null if not found.
 */
export function findCalloutRangeById(
	editor: Editor,
	requestId: string
): { from: number; to: number } | null {
	const lineCount = editor.lineCount();
	const needle = `<!-- rid:${requestId} -->`;

	let markerLine = -1;
	for (let i = 0; i < lineCount; i++) {
		if (editor.getLine(i).includes(needle)) {
			markerLine = i;
			break;
		}
	}

	if (markerLine === -1) {
		return null;
	}

	// Scan forward to find end of blockquote block.
	let endLine = markerLine;
	for (let i = markerLine + 1; i < lineCount; i++) {
		if (editor.getLine(i).startsWith(">")) {
			endLine = i;
		} else {
			break;
		}
	}

	return { from: markerLine, to: endLine };
}

/**
 * Unified callout finder: tries ID-based search first, then falls back
 * to proximity search. Returns inclusive {from, to} line numbers, or null.
 */
export function findCalloutBlock(
	editor: Editor,
	requestId?: string,
	nearLine?: number
): { from: number; to: number } | null {
	// Try ID-based search first when a requestId is available.
	if (requestId) {
		const byId = findCalloutRangeById(editor, requestId);
		if (byId) {
			return byId;
		}
	}

	// Fall back to proximity search when available.
	if (nearLine !== undefined) {
		return findCalloutRange(editor, nearLine);
	}

	return null;
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


