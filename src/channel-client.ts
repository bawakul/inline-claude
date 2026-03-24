import { requestUrl } from "obsidian";

export type SendPromptResult =
	| { ok: true; request_id: string }
	| { ok: false; error: string };

export type PollReplyResult =
	| { ok: true; status: "pending" }
	| { ok: true; status: "complete"; response: string }
	| { ok: false; error: string };

/**
 * POST a prompt to the channel server.
 * Returns the request_id on success, or a structured error.
 */
export async function sendPrompt(
	port: number,
	payload: { filename: string; line: number; query: string }
): Promise<SendPromptResult> {
	try {
		const res = await requestUrl({
			url: `http://127.0.0.1:${port}/prompt`,
			method: "POST",
			body: JSON.stringify(payload),
			headers: { "Content-Type": "application/json" },
			throw: false,
		});

		if (res.status === 200) {
			const data = res.json;
			return { ok: true, request_id: data.request_id };
		}

		// Non-200 — try to extract an error message from the body
		let errorMsg: string;
		try {
			errorMsg = res.json?.error ?? res.text ?? `HTTP ${res.status}`;
		} catch {
			errorMsg = `HTTP ${res.status}`;
		}
		return { ok: false, error: errorMsg };
	} catch (err: unknown) {
		const message =
			err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}

/**
 * Poll the channel server for a reply.
 * Returns pending, complete with response, or a structured error.
 */
export async function pollReply(
	port: number,
	requestId: string
): Promise<PollReplyResult> {
	try {
		const res = await requestUrl({
			url: `http://127.0.0.1:${port}/poll/${requestId}`,
			method: "GET",
			throw: false,
		});

		if (res.status === 200) {
			const data = res.json;
			if (data.status === "complete") {
				return {
					ok: true,
					status: "complete",
					response: data.response,
				};
			}
			return { ok: true, status: "pending" };
		}

		let errorMsg: string;
		try {
			errorMsg = res.json?.error ?? res.text ?? `HTTP ${res.status}`;
		} catch {
			errorMsg = `HTTP ${res.status}`;
		}
		return { ok: false, error: errorMsg };
	} catch (err: unknown) {
		const message =
			err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
