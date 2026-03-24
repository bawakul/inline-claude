import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendPrompt, pollReply } from "../channel-client";

// vi.hoisted() runs before vi.mock hoisting, so mockRequestUrl is available
// inside the factory. See: https://vitest.dev/api/vi.html#vi-hoisted
const { mockRequestUrl } = vi.hoisted(() => ({
	mockRequestUrl: vi.fn(),
}));

vi.mock("obsidian", async (importOriginal) => {
	const original = await importOriginal<typeof import("obsidian")>();
	return {
		...original,
		requestUrl: mockRequestUrl,
	};
});

beforeEach(() => {
	mockRequestUrl.mockReset();
});

describe("sendPrompt", () => {
	const payload = { filename: "test.md", line: 5, query: "What is X?" };

	it("returns request_id on success (200)", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 200,
			json: { request_id: "abc-123" },
		});

		const result = await sendPrompt(4321, payload);

		expect(result).toEqual({ ok: true, request_id: "abc-123" });
		expect(mockRequestUrl).toHaveBeenCalledWith({
			url: "http://127.0.0.1:4321/prompt",
			method: "POST",
			body: JSON.stringify(payload),
			headers: { "Content-Type": "application/json" },
			throw: false,
		});
	});

	it("returns error on non-200 status", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 400,
			json: { error: "Missing query field" },
			text: "Missing query field",
		});

		const result = await sendPrompt(4321, payload);

		expect(result).toEqual({ ok: false, error: "Missing query field" });
	});

	it("returns error on connection refused", async () => {
		mockRequestUrl.mockRejectedValue(
			new Error("net::ERR_CONNECTION_REFUSED")
		);

		const result = await sendPrompt(4321, payload);

		expect(result).toEqual({
			ok: false,
			error: "net::ERR_CONNECTION_REFUSED",
		});
	});
});

describe("pollReply", () => {
	it("returns pending when status is pending", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 200,
			json: { status: "pending" },
		});

		const result = await pollReply(4321, "abc-123");

		expect(result).toEqual({ ok: true, status: "pending" });
		expect(mockRequestUrl).toHaveBeenCalledWith({
			url: "http://127.0.0.1:4321/poll/abc-123",
			method: "GET",
			throw: false,
		});
	});

	it("returns complete with response when status is complete", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 200,
			json: { status: "complete", response: "X is a variable." },
		});

		const result = await pollReply(4321, "abc-123");

		expect(result).toEqual({
			ok: true,
			status: "complete",
			response: "X is a variable.",
		});
	});

	it("returns error on 404", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 404,
			json: { error: "Unknown request_id" },
			text: "Unknown request_id",
		});

		const result = await pollReply(4321, "nonexistent");

		expect(result).toEqual({ ok: false, error: "Unknown request_id" });
	});

	it("returns error on connection refused", async () => {
		mockRequestUrl.mockRejectedValue(
			new Error("net::ERR_CONNECTION_REFUSED")
		);

		const result = await pollReply(4321, "abc-123");

		expect(result).toEqual({
			ok: false,
			error: "net::ERR_CONNECTION_REFUSED",
		});
	});
});
