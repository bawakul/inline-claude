import {
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
} from "obsidian";
import type ClaudeChatPlugin from "./main";
import { buildCalloutHeader, findCalloutBlock, replaceCalloutBlock, buildResponseCallout, buildErrorCallout, formatElapsed } from "./callout";
import { sendPrompt, pollReply } from "./channel-client";

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
				const range = findCalloutBlock(editor, value, nearLine);
				if (range) {
					replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, sendResult.error));
				}
				return;
			}

			const serverRequestId = sendResult.request_id;
			console.log(`Prompt sent, request_id: ${serverRequestId}`);

			const startTime = Date.now();

			const intervalId = setInterval(async () => {
				// Check if user navigated away
				const activeFile = this.plugin.app.workspace.getActiveFile?.();
				if (activeFile && activeFile.path !== filePath) {
					console.log(`File changed (${filePath} → ${activeFile.path}), cancelling poller for ${pollerId}`);
					this.plugin.cancelPoller(pollerId);
					return;
				}

				const elapsed = Date.now() - startTime;

				if (elapsed > timeoutMs) {
					const errorMsg = `No response after ${formatElapsed(elapsed)}.`;
					console.log(`Poll timeout for ${pollerId} after ${elapsed}ms`);

					const range = findCalloutBlock(editor, value, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, errorMsg));
					}
					this.plugin.cancelPoller(pollerId);
					return;
				}

				const pollResult = await pollReply(port, serverRequestId);

				if (!pollResult.ok) {
					console.log(`Poll error for ${pollerId}: ${pollResult.error}`);
					const range = findCalloutBlock(editor, value, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, pollResult.error));
					}
					this.plugin.cancelPoller(pollerId);
					return;
				}

				if (pollResult.status === "complete") {
					console.log(`Poll complete for ${pollerId}`);
					const range = findCalloutBlock(editor, value, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildResponseCallout(value, pollResult.response));
					}
					this.plugin.cancelPoller(pollerId);
					return;
				}

				// Still pending — continue polling
			}, 1000) as unknown as number;

			// Register with both Obsidian (auto-cleanup) and our tracker
			this.plugin.registerInterval(intervalId);
			this.plugin.registerPoller(pollerId, intervalId);
		})();
	}
}


