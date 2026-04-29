import {
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	Notice,
	TFile,
} from "obsidian";
import type ClaudeChatPlugin from "./main";
import { buildCalloutHeader, findCalloutBlock, replaceCalloutBlock, buildResponseCallout, buildErrorCallout, formatElapsed } from "./callout";
import { sendPrompt, pollReply } from "./channel-client";
import { findCanvasNodeIdForEditor, deliverCanvasReply, patchCanvasJson } from "./canvas";

/**
 * Pure function for trigger detection — exported for unit testing.
 * Scans the text before the cursor for the last occurrence of triggerPhrase.
 * Returns the trigger index and the query text after the trigger, or null.
 */
export function findTrigger(
	lineText: string,
	cursorCh: number,
	triggerPhrase: string
): { triggerIndex: number; query: string } | null {
	const textBeforeCursor = lineText.substring(0, cursorCh);
	const triggerIndex = textBeforeCursor.lastIndexOf(triggerPhrase);
	if (triggerIndex === -1) {
		return null;
	}
	const query = textBeforeCursor.substring(
		triggerIndex + triggerPhrase.length
	);
	return { triggerIndex, query };
}

export class ClaudeSuggest extends EditorSuggest<string> {
	plugin: ClaudeChatPlugin;

	constructor(plugin: ClaudeChatPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		_file: TFile | null
	): EditorSuggestTriggerInfo | null {
		const lineText = editor.getLine(cursor.line);
		const result = findTrigger(
			lineText,
			cursor.ch,
			this.plugin.settings.triggerPhrase
		);
		if (result === null) {
			return null;
		}
		return {
			start: { line: cursor.line, ch: result.triggerIndex },
			end: cursor,
			query: result.query,
		};
	}

	getSuggestions(
		context: EditorSuggestContext
	): string[] | Promise<string[]> {
		if (context.query.trim() === "") {
			return [];
		}
		return [context.query];
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText("Ask Claude: " + value);
	}

	/**
	 * Write an error callout into a canvas text node via the Canvas API pipeline.
	 *
	 * Used by the three non-success branches (send-failure, poll-error, timeout)
	 * when the trigger originated from a `.canvas` file. NEVER calls
	 * replaceCalloutBlock(editor, ...) — that is the #14 bug class for canvas
	 * (silently no-ops once focus leaves the embedded editor); routing through
	 * deliverCanvasReply / patchCanvasJson is the D-09 contract.
	 *
	 * Per D-07, always surfaces the failure loudly: console.error + Notice toast.
	 * If even patchCanvasJson fails (e.g. file deleted), Notice is the surface.
	 */
	private async writeCanvasErrorCallout(
		filename: string,
		nodeId: string | null,
		query: string,
		reason: string,
		originalError?: unknown,
	): Promise<void> {
		console.error(`Inline Claude canvas write failed: ${reason}`, originalError);
		new Notice("Inline Claude: Canvas API write failed. See console for details.");

		const errorBody = buildErrorCallout(query, reason);

		// Try the Canvas API pipeline first (open-leaf write or, if no leaf, JSON patch).
		const result = await deliverCanvasReply(this.plugin.app, filename, nodeId, query, errorBody);
		if (result.ok) return;

		// deliverCanvasReply only fell back to patchCanvasJson on no-leaf; for any
		// other failure (probe-failed / no-match / exception), force a final
		// patchCanvasJson attempt so on-disk content gets the error callout.
		// (patchCanvasJson is guaranteed to land when no leaf is open and is
		//  the safest available write surface when the runtime API is broken.)
		const patchResult = await patchCanvasJson(this.plugin.app, filename, nodeId, query, errorBody);
		if (!patchResult.ok) {
			console.error(`Inline Claude: error-callout JSON-patch fallback also failed: ${(patchResult as any).reason}`);
		}
	}

	selectSuggestion(
		value: string,
		_evt: MouseEvent | KeyboardEvent
	): void {
		const ctx = this.context;
		if (!ctx) {
			return;
		}
		const { editor, start, end, file } = ctx as EditorSuggestContext & {
			file: TFile | null;
		};

		const filename = file
			? file.path
			: this.plugin.app.workspace.getActiveFile()?.path ?? "";
		const nearLine = start.line;

		// Canvas trigger probe (D-01). When the user typed `;;` inside a `.canvas`
		// text node, capture the canvas node ID so the reply step can match by ID
		// (D-05) instead of fuzzy query text. Probe miss is non-fatal (D-03) — we
		// log a warning and let the reply step fall back to query-text matching.
		let canvasNodeId: string | null = null;
		if (filename.endsWith(".canvas")) {
			canvasNodeId = findCanvasNodeIdForEditor(this.plugin.app, filename, editor);
			if (canvasNodeId === null) {
				console.warn(
					`Inline Claude: canvas trigger in ${filename} but no node matched ctx.editor. ` +
					`Falling back to query-text matching at reply time.`,
				);
			}
		}

		// Insert single-line callout + blank line for cursor
		editor.replaceRange(buildCalloutHeader(value) + "\n\n", start, end);
		// Place cursor on the blank line below the callout (R030)
		editor.setCursor({ line: start.line + 2, ch: 0 });

		this.plugin.lastQuery = {
			filename,
			line: nearLine,
			query: value,
		};

		const port = this.plugin.settings.channelPort;
		const timeoutMs = this.plugin.settings.pollingTimeoutSecs * 1000;
		const filePath = filename;
		const pollerId = crypto.randomUUID();

		// Fire-and-forget async flow — selectSuggestion must be synchronous
		(async () => {
			console.log(`Sending prompt to channel: "${value}"`);
			const sendResult = await sendPrompt(port, { filename, line: nearLine, query: value });

			if (!sendResult.ok) {
				console.log(`Send failed: ${sendResult.error}`);
				if (filename.endsWith(".canvas")) {
					await this.writeCanvasErrorCallout(filename, canvasNodeId, value, sendResult.error);
				} else {
					const range = findCalloutBlock(editor, value, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, sendResult.error));
					}
				}
				return;
			}

			const serverRequestId = sendResult.request_id;
			console.log(`Prompt sent, request_id: ${serverRequestId}`);

			const startTime = Date.now();

			const intervalId = setInterval(async () => {
				// Markdown path: cancel if the user navigated away (editor.replaceRange
				// needs the active editor). Canvas path: keep polling — deliverCanvasReply
				// writes via Canvas API or JSON-patch fallback, neither of which cares
				// about focus, and the markdown #14 race doesn't apply here.
				const activeFile = this.plugin.app.workspace.getActiveFile?.();
				if (activeFile && activeFile.path !== filePath && canvasNodeId === null) {
					console.log(`File changed (${filePath} → ${activeFile.path}), cancelling poller for ${pollerId}`);
					this.plugin.cancelPoller(pollerId);
					return;
				}

				const elapsed = Date.now() - startTime;

				if (elapsed > timeoutMs) {
					const errorMsg = `No response after ${formatElapsed(elapsed)}.`;
					console.log(`Poll timeout for ${pollerId} after ${elapsed}ms`);

					if (filename.endsWith(".canvas")) {
						await this.writeCanvasErrorCallout(filename, canvasNodeId, value, errorMsg);
					} else {
						const range = findCalloutBlock(editor, value, nearLine);
						if (range) {
							replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, errorMsg));
						}
					}
					this.plugin.cancelPoller(pollerId);
					return;
				}

				const pollResult = await pollReply(port, serverRequestId);

				if (!pollResult.ok) {
					console.log(`Poll error for ${pollerId}: ${pollResult.error}`);
					if (filename.endsWith(".canvas")) {
						await this.writeCanvasErrorCallout(filename, canvasNodeId, value, pollResult.error);
					} else {
						const range = findCalloutBlock(editor, value, nearLine);
						if (range) {
							replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, pollResult.error));
						}
					}
					this.plugin.cancelPoller(pollerId);
					return;
				}

				if (pollResult.status === "complete") {
					console.log(`Poll complete for ${pollerId}`);

					if (filename.endsWith(".canvas")) {
						const result = await deliverCanvasReply(
							this.plugin.app,
							filename,
							canvasNodeId,
							value,
							buildResponseCallout(value, pollResult.response),
						);
						if (!result.ok) {
							// D-07 loud failure on success-path write. Use the same canvas-aware
							// error helper — never replaceCalloutBlock(editor, ...) on the canvas
							// branch (that is the #14 bug class — see D-09 + PATTERNS.md note).
							const reason = (result as any).reason ?? "unknown";
							await this.writeCanvasErrorCallout(filename, canvasNodeId, value, `Canvas write failed: ${reason}`, (result as any).error);
						}
					} else {
						// Markdown path — UNCHANGED per D-06.
						const range = findCalloutBlock(editor, value, nearLine);
						if (range) {
							replaceCalloutBlock(editor, range.from, range.to, buildResponseCallout(value, pollResult.response));
						}
					}

					this.plugin.cancelPoller(pollerId);
					return;
				}

				// Still pending — continue polling
			}, 1000) as unknown as number;

			// Register with both Obsidian (auto-cleanup) and our tracker
			this.plugin.registerInterval(intervalId);
			this.plugin.registerPoller(pollerId, intervalId, canvasNodeId);
		})();
	}
}


