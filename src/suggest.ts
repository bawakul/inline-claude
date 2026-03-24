import {
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
} from "obsidian";
import type ClaudeChatPlugin from "./main";
import { insertCallout, findCalloutRange, findCalloutBlock, replaceCalloutBlock, buildResponseCallout, buildErrorCallout, buildThinkingBody, buildTimeoutCallout, buildRetryThinkingCallout, RETRY_PROMPT } from "./callout";
import { sendPrompt, pollReply } from "./channel-client";

/** Retry timeout: 2 minutes — hardcoded, not configurable. */
const RETRY_TIMEOUT_MS = 120_000;

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

		insertCallout(editor, start, end, value);

		const filename = file ? file.path : "";
		const nearLine = start.line;

		this.plugin.lastQuery = {
			filename,
			line: nearLine,
			query: value,
		};

		const port = this.plugin.settings.channelPort;
		const timeoutMs = this.plugin.settings.pollingTimeoutSecs * 1000;
		const filePath = filename;

		// Fire-and-forget async flow — selectSuggestion must be synchronous
		(async () => {
			console.log(`Sending prompt to channel: "${value}"`);
			const sendResult = await sendPrompt(port, { filename, line: nearLine, query: value });

			if (!sendResult.ok) {
				console.log(`Send failed: ${sendResult.error}`);
				const range = findCalloutRange(editor, nearLine);
				if (range) {
					replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, sendResult.error));
				}
				return;
			}

			const requestId = sendResult.request_id;
			console.log(`Prompt sent, request_id: ${requestId}`);

			// Patch the rid into the just-inserted callout header
			const patchRange = findCalloutRange(editor, nearLine);
			if (patchRange) {
				const headerLine = editor.getLine(patchRange.from);
				const patchedHeader = headerLine + ` <!-- rid:${requestId} -->`;
				editor.replaceRange(
					patchedHeader,
					{ line: patchRange.from, ch: 0 },
					{ line: patchRange.from, ch: headerLine.length }
				);
			}

			const startTime = Date.now();
			let lastDisplayUpdate = 0;

			const intervalId = setInterval(async () => {
				// Check if user navigated away
				const activeFile = this.plugin.app.workspace.getActiveFile?.();
				if (activeFile && activeFile.path !== filePath) {
					console.log(`File changed (${filePath} → ${activeFile.path}), cancelling poller for ${requestId}`);
					this.plugin.cancelPoller(requestId);
					return;
				}

				const elapsed = Date.now() - startTime;

				// --- Elapsed-time display update (before timeout/poll logic) ---
				if (elapsed - lastDisplayUpdate >= 5000) {
					const warning = elapsed >= 120000;
					const range = findCalloutBlock(editor, requestId, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildThinkingBody(value, elapsed, warning));
					}
					lastDisplayUpdate = elapsed;
				}

				if (elapsed > timeoutMs) {
					console.log(`Poll timeout for ${requestId} after ${elapsed}ms — starting retry`);
					this.plugin.cancelPoller(requestId);

					// 1. Replace original callout with "Timed out" state
					const range = findCalloutBlock(editor, requestId, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildTimeoutCallout(value, elapsed));
					}

					// 2. Calculate insertion position — after the timed-out callout + blank line
					const insertLine = range ? range.to + 1 : nearLine + 2;
					const retryCalloutText = "\n" + buildRetryThinkingCallout();
					const insertPos = { line: insertLine, ch: 0 };

					// Ensure there's a newline before inserting (avoid merging with previous line)
					const prevLineText = editor.getLine(insertLine - 1);
					const prefix = prevLineText === "" ? "" : "\n";
					editor.replaceRange(prefix + retryCalloutText, insertPos, insertPos);

					// 3. Send retry prompt
					const retryLine = insertLine + (prefix ? 1 : 0);
					const retrySendResult = await sendPrompt(port, { filename, line: retryLine, query: RETRY_PROMPT });

					if (!retrySendResult.ok) {
						console.log(`Retry send failed: ${retrySendResult.error}`);
						// Find the retry callout we just inserted and replace with error
						const retryRange = findCalloutRange(editor, retryLine, "> [!claude] Thinking...");
						if (retryRange) {
							replaceCalloutBlock(editor, retryRange.from, retryRange.to, buildErrorCallout(RETRY_PROMPT, retrySendResult.error));
						}
						return;
					}

					const retryRequestId = retrySendResult.request_id;
					console.log(`Retry sent, request_id: ${retryRequestId}`);

					// Patch rid into the retry callout header
					const retryPatchRange = findCalloutRange(editor, retryLine, "> [!claude] Thinking...");
					if (retryPatchRange) {
						const retryHeaderLine = editor.getLine(retryPatchRange.from);
						const patchedRetryHeader = retryHeaderLine + ` <!-- rid:${retryRequestId} -->`;
						editor.replaceRange(
							patchedRetryHeader,
							{ line: retryPatchRange.from, ch: 0 },
							{ line: retryPatchRange.from, ch: retryHeaderLine.length }
						);
					}

					// 4. Start retry poll loop — simpler than original (no elapsed updates, no second retry)
					const retryStartTime = Date.now();

					const retryIntervalId = setInterval(async () => {
						// File-switch detection
						const currentFile = this.plugin.app.workspace.getActiveFile?.();
						if (currentFile && currentFile.path !== filePath) {
							console.log(`File changed during retry (${filePath} → ${currentFile.path}), cancelling retry poller for ${retryRequestId}`);
							this.plugin.cancelPoller(retryRequestId);
							return;
						}

						const retryElapsed = Date.now() - retryStartTime;

						if (retryElapsed > RETRY_TIMEOUT_MS) {
							console.log(`Retry timeout for ${retryRequestId} after ${retryElapsed}ms`);
							const retryRange = findCalloutBlock(editor, retryRequestId, retryLine);
							if (retryRange) {
								replaceCalloutBlock(editor, retryRange.from, retryRange.to, buildErrorCallout(RETRY_PROMPT, "Retry also timed out after 2 minutes."));
							}
							this.plugin.cancelPoller(retryRequestId);
							return;
						}

						const retryPollResult = await pollReply(port, retryRequestId);

						if (!retryPollResult.ok) {
							console.log(`Retry poll error for ${retryRequestId}: ${retryPollResult.error}`);
							const retryRange = findCalloutBlock(editor, retryRequestId, retryLine);
							if (retryRange) {
								replaceCalloutBlock(editor, retryRange.from, retryRange.to, buildErrorCallout(RETRY_PROMPT, retryPollResult.error));
							}
							this.plugin.cancelPoller(retryRequestId);
							return;
						}

						if (retryPollResult.status === "complete") {
							console.log(`Retry poll complete for ${retryRequestId}`);
							const retryRange = findCalloutBlock(editor, retryRequestId, retryLine);
							if (retryRange) {
								replaceCalloutBlock(editor, retryRange.from, retryRange.to, buildResponseCallout(RETRY_PROMPT, retryPollResult.response));
							}
							this.plugin.cancelPoller(retryRequestId);
							return;
						}

						// Still pending — continue polling
					}, 1000) as unknown as number;

					this.plugin.registerInterval(retryIntervalId);
					this.plugin.registerPoller(retryRequestId, retryIntervalId);
					return;
				}

				const pollResult = await pollReply(port, requestId);

				if (!pollResult.ok) {
					console.log(`Poll error for ${requestId}: ${pollResult.error}`);
					const range = findCalloutBlock(editor, requestId, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, pollResult.error));
					}
					this.plugin.cancelPoller(requestId);
					return;
				}

				if (pollResult.status === "complete") {
					console.log(`Poll complete for ${requestId}`);
					const range = findCalloutBlock(editor, requestId, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildResponseCallout(value, pollResult.response));
					}
					this.plugin.cancelPoller(requestId);
					return;
				}

				// Still pending — continue polling
			}, 1000) as unknown as number;

			// Register with both Obsidian (auto-cleanup) and our tracker
			this.plugin.registerInterval(intervalId);
			this.plugin.registerPoller(requestId, intervalId);
		})();
	}
}
