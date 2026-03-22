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
