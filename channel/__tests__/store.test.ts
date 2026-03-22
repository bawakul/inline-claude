import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import {
	createRequest,
	storeReply,
	getStatus,
	getRequestMeta,
	clearAll,
} from "../store";

// UUID v4 pattern
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("store", () => {
	afterEach(() => {
		clearAll();
		vi.useRealTimers();
	});

	describe("createRequest", () => {
		it("returns an object with a UUID request_id", () => {
			const result = createRequest("test.md", 1, "hello");
			expect(result).toHaveProperty("request_id");
			expect(result.request_id).toMatch(UUID_RE);
		});

		it("generates unique ids across calls", () => {
			const a = createRequest("a.md", 1, "q1");
			const b = createRequest("b.md", 2, "q2");
			expect(a.request_id).not.toBe(b.request_id);
		});
	});

	describe("getStatus", () => {
		it("returns pending status with metadata after create", () => {
			const { request_id } = createRequest("note.md", 42, "explain this");
			const status = getStatus(request_id);
			expect(status).toEqual({
				status: "pending",
				filename: "note.md",
				line: 42,
				query: "explain this",
			});
		});

		it("returns null for unknown request_id", () => {
			expect(getStatus("nonexistent-id")).toBeNull();
		});

		it("includes response after reply is stored", () => {
			const { request_id } = createRequest("note.md", 1, "q");
			storeReply(request_id, "the answer");
			const status = getStatus(request_id);
			expect(status).toEqual({
				status: "complete",
				response: "the answer",
				filename: "note.md",
				line: 1,
				query: "q",
			});
		});
	});

	describe("storeReply", () => {
		it("returns true for a valid pending request", () => {
			const { request_id } = createRequest("f.md", 1, "q");
			expect(storeReply(request_id, "reply text")).toBe(true);
		});

		it("returns false for an unknown request_id", () => {
			expect(storeReply("unknown-id", "reply")).toBe(false);
		});

		it("returns false on double-reply (already complete)", () => {
			const { request_id } = createRequest("f.md", 1, "q");
			storeReply(request_id, "first reply");
			expect(storeReply(request_id, "second reply")).toBe(false);
		});

		it("does not overwrite response on double-reply", () => {
			const { request_id } = createRequest("f.md", 1, "q");
			storeReply(request_id, "first reply");
			storeReply(request_id, "second reply");
			const status = getStatus(request_id);
			expect(status?.response).toBe("first reply");
		});
	});

	describe("getRequestMeta", () => {
		it("returns file context for a valid request", () => {
			const { request_id } = createRequest("deep/path.md", 99, "what is X?");
			expect(getRequestMeta(request_id)).toEqual({
				filename: "deep/path.md",
				line: 99,
				query: "what is X?",
			});
		});

		it("returns null for an unknown request_id", () => {
			expect(getRequestMeta("missing-id")).toBeNull();
		});
	});

	describe("TTL expiry", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		it("entry is available before TTL", () => {
			const { request_id } = createRequest("f.md", 1, "q");
			vi.advanceTimersByTime(4 * 60 * 1000); // 4 minutes
			expect(getStatus(request_id)).not.toBeNull();
		});

		it("entry is removed after TTL expires", () => {
			const { request_id } = createRequest("f.md", 1, "q");
			vi.advanceTimersByTime(5 * 60 * 1000 + 1); // 5 min + 1ms
			expect(getStatus(request_id)).toBeNull();
		});

		it("expired entry cannot receive a reply", () => {
			const { request_id } = createRequest("f.md", 1, "q");
			vi.advanceTimersByTime(5 * 60 * 1000 + 1);
			expect(storeReply(request_id, "too late")).toBe(false);
		});
	});

	describe("clearAll", () => {
		it("removes all entries", () => {
			const a = createRequest("a.md", 1, "q1");
			const b = createRequest("b.md", 2, "q2");
			clearAll();
			expect(getStatus(a.request_id)).toBeNull();
			expect(getStatus(b.request_id)).toBeNull();
		});
	});
});
