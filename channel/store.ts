/**
 * In-memory request store for the channel server.
 *
 * Maps request_id → RequestEntry. Each entry auto-expires after TTL_MS.
 * All logging uses console.error — stdout is reserved for MCP JSON-RPC.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface RequestEntry {
	request_id: string;
	filename: string;
	line: number;
	query: string;
	status: "pending" | "complete";
	response?: string;
	created: number;
	timer: ReturnType<typeof setTimeout>;
}

const store = new Map<string, RequestEntry>();

/**
 * Create a new pending request with auto-expiry.
 * Returns the generated request_id for polling/reply.
 */
export function createRequest(
	filename: string,
	line: number,
	query: string,
): { request_id: string } {
	const request_id = crypto.randomUUID();

	const timer = setTimeout(() => {
		store.delete(request_id);
		console.error(`[channel] request expired: ${request_id}`);
	}, TTL_MS);

	const entry: RequestEntry = {
		request_id,
		filename,
		line,
		query,
		status: "pending",
		created: Date.now(),
		timer,
	};

	store.set(request_id, entry);
	console.error(`[channel] request created: ${request_id}`);
	return { request_id };
}

/**
 * Store a reply for a pending request.
 * Returns true if the reply was stored, false if the request
 * doesn't exist or is already complete (no double-reply).
 */
export function storeReply(request_id: string, text: string): boolean {
	const entry = store.get(request_id);
	if (!entry || entry.status === "complete") {
		return false;
	}

	entry.status = "complete";
	entry.response = text;
	console.error(`[channel] reply stored: ${request_id}`);
	return true;
}

/**
 * Get the full status of a request.
 * Returns null if the request_id is unknown or expired.
 */
export function getStatus(
	request_id: string,
): {
	status: string;
	response?: string;
	filename?: string;
	line?: number;
	query?: string;
} | null {
	const entry = store.get(request_id);
	if (!entry) return null;

	return {
		status: entry.status,
		...(entry.status === "complete" ? { response: entry.response } : {}),
		filename: entry.filename,
		line: entry.line,
		query: entry.query,
	};
}

/**
 * Get just the file context metadata for a request.
 * Used by the server to construct notification payloads.
 */
export function getRequestMeta(
	request_id: string,
): { filename: string; line: number; query: string } | null {
	const entry = store.get(request_id);
	if (!entry) return null;

	return {
		filename: entry.filename,
		line: entry.line,
		query: entry.query,
	};
}

/**
 * Clear all entries and cancel their expiry timers.
 * Used for test cleanup.
 */
export function clearAll(): void {
	for (const entry of store.values()) {
		clearTimeout(entry.timer);
	}
	store.clear();
}
