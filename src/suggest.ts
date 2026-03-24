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

		const filename = file ? file.path : "";
		const nearLine = start.line;

		// Generate client UUID for the rid marker BEFORE insertion.
		// This ensures the post-processor can find the request in the state map
		// as soon as Obsidian renders the callout.
		const clientRid = crypto.randomUUID();
		this.plugin.addPendingRequest(clientRid, value, nearLine);

		// Insert single-line callout with rid already embedded + blank line for cursor
		editor.replaceRange(buildCalloutHeader(value, clientRid) + "\n\n", start, end);
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

		// Fire-and-forget async flow — selectSuggestion must be synchronous
		(async () => {
			console.log(`Sending prompt to channel: "${value}"`);
			const sendResult = await sendPrompt(port, { filename, line: nearLine, query: value });

			if (!sendResult.ok) {
				console.log(`Send failed: ${sendResult.error}`);
				this.plugin.removePendingRequest(clientRid);
				const range = findCalloutBlock(editor, clientRid, nearLine);
				if (range) {
					replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, sendResult.error));
				}
				return;
			}

			// Use the server's request_id for polling, but the clientRid stays in the DOM/state map
			const serverRequestId = sendResult.request_id;
			console.log(`Prompt sent, request_id: ${serverRequestId} (rid: ${clientRid})`);

			const startTime = Date.now();

			const intervalId = setInterval(async () => {
				// Check if user navigated away
				const activeFile = this.plugin.app.workspace.getActiveFile?.();
				if (activeFile && activeFile.path !== filePath) {
					console.log(`File changed (${filePath} → ${activeFile.path}), cancelling poller for ${clientRid}`);
					this.plugin.removePendingRequest(clientRid);
					this.plugin.cancelPoller(clientRid);
					return;
				}

				const elapsed = Date.now() - startTime;

				if (elapsed > timeoutMs) {
					const errorMsg = `No response after ${formatElapsed(elapsed)}.`;
					console.log(`Poll timeout for ${clientRid} after ${elapsed}ms — transitioning to error state`);

					// Update pendingRequests to error state (entry stays for post-processor)
					this.plugin.updatePendingRequest(clientRid, {
						status: "error",
						errorMessage: errorMsg,
						retryable: true,
					});

					// Write error callout to file
					const range = findCalloutBlock(editor, clientRid, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, errorMsg));
					}
					this.plugin.cancelPoller(clientRid);
					return;
				}

				const pollResult = await pollReply(port, serverRequestId);

				if (!pollResult.ok) {
					console.log(`Poll error for ${clientRid}: ${pollResult.error}`);
					this.plugin.removePendingRequest(clientRid);
					const range = findCalloutBlock(editor, clientRid, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(value, pollResult.error));
					}
					this.plugin.cancelPoller(clientRid);
					return;
				}

				if (pollResult.status === "complete") {
					console.log(`Poll complete for ${clientRid}`);
					this.plugin.removePendingRequest(clientRid);
					const range = findCalloutBlock(editor, clientRid, nearLine);
					if (range) {
						replaceCalloutBlock(editor, range.from, range.to, buildResponseCallout(value, pollResult.response));
					}
					this.plugin.cancelPoller(clientRid);
					return;
				}

				// Still pending — continue polling
			}, 1000) as unknown as number;

			// Register with both Obsidian (auto-cleanup) and our tracker
			this.plugin.registerInterval(intervalId);
			this.plugin.registerPoller(clientRid, intervalId);
		})();
	}
}

/**
 * Retry a failed request by re-sending the original query and starting a new poll loop.
 * Called by the Retry button click handler in the post-processor.
 *
 * Reads the original query from the pendingRequests map, removes the error entry,
 * creates a new pending entry with a fresh clientRid, replaces the error callout with
 * a new thinking header, sends the prompt, and starts polling.
 */
export async function retryRequest(plugin: ClaudeChatPlugin, requestId: string): Promise<void> {
	console.log(`retryRequest: starting for ${requestId}`);

	const entry = plugin.pendingRequests.get(requestId);
	if (!entry || entry.status !== "error") {
		console.log(`retryRequest: no error entry found for ${requestId}, aborting`);
		return;
	}

	const editor = (plugin.app.workspace as any).activeEditor?.editor;
	if (!editor) {
		console.warn("retryRequest: no active editor, aborting");
		return;
	}

	const query = entry.query;
	const nearLine = entry.nearLine;
	const newRid = crypto.randomUUID();

	// Remove old error entry, add new thinking entry
	plugin.removePendingRequest(requestId);
	plugin.addPendingRequest(newRid, query, nearLine);
	plugin.updatePendingRequest(newRid, { retryOf: requestId });

	// Replace error callout in the file with new thinking header
	const range = findCalloutBlock(editor, requestId, nearLine);
	if (range) {
		replaceCalloutBlock(editor, range.from, range.to, buildCalloutHeader(query, newRid) + "\n\n");
	}

	const filename = plugin.app.workspace.getActiveFile?.()?.path ?? "";
	const port = plugin.settings.channelPort;
	const timeoutMs = plugin.settings.pollingTimeoutSecs * 1000;
	const filePath = filename;

	console.log(`retryRequest: sending prompt "${query}" with new rid ${newRid}`);
	const sendResult = await sendPrompt(port, { filename, line: nearLine, query });

	if (!sendResult.ok) {
		console.log(`retryRequest: send failed: ${sendResult.error}`);
		plugin.removePendingRequest(newRid);
		const errRange = findCalloutBlock(editor, newRid, nearLine);
		if (errRange) {
			replaceCalloutBlock(editor, errRange.from, errRange.to, buildErrorCallout(query, sendResult.error));
		}
		return;
	}

	const serverRequestId = sendResult.request_id;
	console.log(`retryRequest: prompt sent, request_id: ${serverRequestId} (rid: ${newRid})`);

	const startTime = Date.now();

	const intervalId = setInterval(async () => {
		// Check if user navigated away
		const activeFile = plugin.app.workspace.getActiveFile?.();
		if (activeFile && activeFile.path !== filePath) {
			console.log(`retryRequest: file changed (${filePath} → ${activeFile.path}), cancelling poller for ${newRid}`);
			plugin.removePendingRequest(newRid);
			plugin.cancelPoller(newRid);
			return;
		}

		const elapsed = Date.now() - startTime;

		if (elapsed > timeoutMs) {
			const errorMsg = `No response after ${formatElapsed(elapsed)}.`;
			console.log(`retryRequest: poll timeout for ${newRid} after ${elapsed}ms`);
			plugin.updatePendingRequest(newRid, {
				status: "error",
				errorMessage: errorMsg,
				retryable: true,
			});
			const range = findCalloutBlock(editor, newRid, nearLine);
			if (range) {
				replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(query, errorMsg));
			}
			plugin.cancelPoller(newRid);
			return;
		}

		const pollResult = await pollReply(port, serverRequestId);

		if (!pollResult.ok) {
			console.log(`retryRequest: poll error for ${newRid}: ${pollResult.error}`);
			plugin.removePendingRequest(newRid);
			const range = findCalloutBlock(editor, newRid, nearLine);
			if (range) {
				replaceCalloutBlock(editor, range.from, range.to, buildErrorCallout(query, pollResult.error));
			}
			plugin.cancelPoller(newRid);
			return;
		}

		if (pollResult.status === "complete") {
			console.log(`retryRequest: poll complete for ${newRid}`);
			plugin.removePendingRequest(newRid);
			const range = findCalloutBlock(editor, newRid, nearLine);
			if (range) {
				replaceCalloutBlock(editor, range.from, range.to, buildResponseCallout(query, pollResult.response));
			}
			plugin.cancelPoller(newRid);
			return;
		}

		// Still pending — continue polling
	}, 1000) as unknown as number;

	plugin.registerInterval(intervalId);
	plugin.registerPoller(newRid, intervalId);
	console.log(`retryRequest: poll loop started for ${newRid}`);
}
