import { describe, it, expect, vi, beforeEach } from "vitest";
import { Notice, TFile } from "obsidian";

// Preserve all original obsidian mock exports — individual tests can override
// per-export via vi.mocked(...) if needed (see channel-client.test.ts:6-16
// for the per-export override pattern). This skeleton just inherits everything.
vi.mock("obsidian", async (importOriginal) => {
	const original = await importOriginal<typeof import("obsidian")>();
	return { ...original };
});

/**
 * Factory: builds a fake canvas leaf object whose `view.canvas.nodes` is a
 * Map matching the runtime shape that src/canvas.ts will probe (per
 * 16-RESEARCH.md §Pattern 1 — local interface stub copied from advanced-canvas).
 *
 * Each node exposes vi.fn() for getData / setData and the canvas exposes
 * vi.fn() for requestSave so tests can assert on call ordering and arguments.
 *
 * Exported so Plan 02 / Plan 04 tests can re-use the same helper.
 */
export function makeCanvasViewMock(
	filePath: string,
	nodes: Array<{ id: string; text: string; editor?: any }>,
): { view: any } {
	const nodeMap = new Map(
		nodes.map((n) => [
			n.id,
			{
				id: n.id,
				child: { data: n.text, editor: n.editor },
				contentEl: { contains: (_: any) => false },
				getData: vi.fn(() => ({
					id: n.id,
					type: "text",
					text: n.text,
					x: 0,
					y: 0,
					width: 100,
					height: 100,
				})),
				setData: vi.fn(),
			},
		]),
	);
	return {
		view: {
			file: { path: filePath } as TFile,
			canvas: {
				nodes: nodeMap,
				requestSave: vi.fn(),
			},
		},
	};
}

beforeEach(() => {
	Notice.reset();
});

describe("findCanvasNodeIdForEditor (D-01, D-03)", () => {
	it.todo("probe finds node by editor identity");
	it.todo("probe miss returns null and caller logs warn");
	it.todo("DOM-containment fallback when node.child.editor is undefined");
});

describe("probeCanvasApi (D-08, corrected per RESEARCH §D-08 Probe Correction)", () => {
	it.todo("probe rejects when leaf.view.canvas is missing");
	it.todo("probe rejects when canvas.nodes is not a Map");
	it.todo("probe rejects when node.setData is not a function");
	it.todo("probe rejects when node.getData is not a function");
	it.todo("probe rejects when canvas.requestSave is not a function");
	it.todo("probe accepts a healthy canvas view");
});

describe("writeCanvasReply (D-05, D-07)", () => {
	it.todo("matches by id when capturedId is provided");
	it.todo("matches by query text when capturedId is null");
	it.todo("distinct replies for duplicate queries (ID-first locate)");
	it.todo("loud failure on api exception");
	it.todo("calls canvas.requestSave after setData");
});

describe("patchCanvasJson (D-04, D-05)", () => {
	it.todo("json patch atomic write");
	it.todo("matches by id first, falls back to query text");
	it.todo("preserves non-target nodes verbatim");
	it.todo("preserves tab indentation in output");
	it.todo("returns ok:false reason:no-file when path unknown");
	it.todo("returns ok:false reason:parse-error when JSON malformed");
});

describe("deliverCanvasReply (orchestration)", () => {
	it.todo("uses Canvas API when leaf is open");
	it.todo("falls back to JSON patch when no canvas leaf for file");
	it.todo("does NOT fall back on probe-failed");
});

// Smoke test so the file is non-empty and the suite considers it loaded.
describe("canvas test scaffolding", () => {
	it("makeCanvasViewMock builds a Map of CanvasNodes with vi.fn() for getData/setData", () => {
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "n1", text: "hello" },
		]);
		expect(mock.view.canvas.nodes.get("n1")).toBeDefined();
		expect(typeof mock.view.canvas.nodes.get("n1").setData).toBe("function");
		expect(typeof mock.view.canvas.nodes.get("n1").getData).toBe("function");
		expect(typeof mock.view.canvas.requestSave).toBe("function");
	});
});
