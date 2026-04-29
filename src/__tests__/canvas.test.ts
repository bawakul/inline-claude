import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Editor, Notice, TFile } from "obsidian";
import {
	deliverCanvasReply,
	findCanvasNodeIdForEditor,
	patchCanvasJson,
	probeCanvasApi,
	writeCanvasReply,
	_resetProbeLogged,
} from "../canvas";
import { buildResponseCallout } from "../callout";
import { SAMPLE_CANVAS_JSON } from "./__fixtures__/sample.canvas.json";

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
	(Notice as any).reset?.();
	// Reset module-level probeLogged flag so logging tests are deterministic
	// across test order (they assert "logged exactly once").
	_resetProbeLogged();
});

describe("findCanvasNodeIdForEditor (D-01, D-03)", () => {
	it("probe finds node by editor identity", () => {
		const editor = new Editor(); // identity sentinel
		const otherEditor = new Editor();
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "n1", text: "...", editor: otherEditor },
			{ id: "n2", text: "...", editor },
		]);
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [mock as any]);
		expect(findCanvasNodeIdForEditor(app, "x.canvas", editor)).toBe("n2");
	});

	it("probe miss returns null and caller logs warn", () => {
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => []);
		const editor = new Editor();
		expect(findCanvasNodeIdForEditor(app, "x.canvas", editor)).toBeNull();
	});

	it("DOM-containment fallback when node.child.editor is undefined (checker warning #3 — dedicated DOM-fallback regression guard)", () => {
		// editor.cm.contentDOM is the DOM ancestry handle the fallback compares.
		const fakeDom = { tag: "DOM" } as unknown as HTMLElement;
		const editor = { cm: { contentDOM: fakeDom } } as unknown as Editor;

		// Build the mock by hand so we can inject contentEl.contains and OMIT
		// child.editor (makeCanvasViewMock would fill child.editor, defeating
		// the fallback path).
		const node = {
			id: "n-dom",
			child: { /* deliberately no editor */ },
			contentEl: { contains: (n: any) => n === fakeDom },
			getData: vi.fn(() => ({
				id: "n-dom",
				type: "text",
				text: "",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
			})),
			setData: vi.fn(),
		};
		const view = {
			file: { path: "x.canvas" } as TFile,
			canvas: {
				nodes: new Map([["n-dom", node as any]]),
				requestSave: vi.fn(),
			},
		};

		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [{ view } as any]);

		expect(findCanvasNodeIdForEditor(app, "x.canvas", editor)).toBe("n-dom");
	});

	it("logs node.child keys exactly once across multiple calls (forensic D-01)", () => {
		const editor = new Editor();
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "n1", text: "...", editor },
		]);
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [mock as any]);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		findCanvasNodeIdForEditor(app, "x.canvas", editor);
		findCanvasNodeIdForEditor(app, "x.canvas", editor);
		findCanvasNodeIdForEditor(app, "x.canvas", editor);

		const childKeyLogs = logSpy.mock.calls.filter((args) =>
			typeof args[0] === "string"
			&& args[0].includes("node.child keys"),
		);
		expect(childKeyLogs.length).toBe(1);

		logSpy.mockRestore();
	});
});

describe("probeCanvasApi (D-08, corrected per RESEARCH §D-08 Probe Correction)", () => {
	it("probe rejects when leaf.view.canvas is missing", () => {
		const r = probeCanvasApi({ file: { path: "x.canvas" } });
		expect(r).toEqual({ ok: false, reason: "no-canvas" });
	});

	it("probe rejects when canvas.nodes is not a Map", () => {
		const r = probeCanvasApi({
			canvas: { nodes: {}, requestSave: () => {} },
		});
		expect(r).toEqual({ ok: false, reason: "nodes-not-map" });
	});

	it("probe rejects when canvas.requestSave is not a function", () => {
		const r = probeCanvasApi({
			canvas: { nodes: new Map(), requestSave: undefined },
		});
		expect(r).toEqual({ ok: false, reason: "no-requestSave" });
	});

	it("probe rejects when first sampled node.setData is not a function (checker warning #4 — per-node check)", () => {
		const node = {
			id: "n1",
			getData: () => ({
				id: "n1",
				type: "text",
				text: "",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
			}),
			// setData missing intentionally
		};
		const r = probeCanvasApi({
			canvas: {
				nodes: new Map([["n1", node as any]]),
				requestSave: () => {},
			},
		});
		expect(r).toEqual({ ok: false, reason: "node-setData-missing" });
	});

	it("probe rejects when first sampled node.getData is not a function (checker warning #4 — per-node check)", () => {
		const node = {
			id: "n1",
			setData: () => {},
			// getData missing intentionally
		};
		const r = probeCanvasApi({
			canvas: {
				nodes: new Map([["n1", node as any]]),
				requestSave: () => {},
			},
		});
		expect(r).toEqual({ ok: false, reason: "node-getData-missing" });
	});

	it("probe accepts a healthy canvas view (with nodes)", () => {
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "n1", text: "hello" },
		]);
		const r = probeCanvasApi(mock.view);
		expect(r.ok).toBe(true);
	});

	it("probe accepts empty-Map canvas (no nodes to sample)", () => {
		const r = probeCanvasApi({
			canvas: { nodes: new Map(), requestSave: () => {} },
		});
		expect(r.ok).toBe(true);
	});
});

describe("writeCanvasReply (D-05, D-07)", () => {
	it("matches by id when capturedId is provided", () => {
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "node-a", text: "> [!claude] what is x" },
			{ id: "node-b", text: "> [!claude] something else" },
		]);
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [mock as any]);

		const r = writeCanvasReply(
			app,
			"x.canvas",
			"node-a",
			"what is x",
			buildResponseCallout("what is x", "the answer"),
		);
		expect(r).toEqual({ ok: true });

		const setDataA = (mock.view.canvas.nodes.get("node-a") as any).setData;
		expect(setDataA).toHaveBeenCalledOnce();
		expect(setDataA.mock.calls[0][0].text).toContain("the answer");
	});

	it("matches by query text when capturedId is null", () => {
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "node-a", text: "> [!claude] what is x" },
			{ id: "node-b", text: "Just some other text" },
		]);
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [mock as any]);

		const r = writeCanvasReply(
			app,
			"x.canvas",
			null,
			"what is x",
			buildResponseCallout("what is x", "fallback worked"),
		);
		expect(r).toEqual({ ok: true });

		const setDataA = (mock.view.canvas.nodes.get("node-a") as any).setData;
		const setDataB = (mock.view.canvas.nodes.get("node-b") as any).setData;
		expect(setDataA).toHaveBeenCalledOnce();
		expect(setDataB).not.toHaveBeenCalled();
	});

	it("distinct replies for duplicate queries (ID-first locate)", () => {
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "node-a", text: "> [!claude] same q" },
			{ id: "node-b", text: "> [!claude] same q" },
		]);
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [mock as any]);

		const r1 = writeCanvasReply(
			app,
			"x.canvas",
			"node-a",
			"same q",
			buildResponseCallout("same q", "first"),
		);
		const r2 = writeCanvasReply(
			app,
			"x.canvas",
			"node-b",
			"same q",
			buildResponseCallout("same q", "second"),
		);

		expect(r1).toEqual({ ok: true });
		expect(r2).toEqual({ ok: true });

		const setDataA = (mock.view.canvas.nodes.get("node-a") as any).setData;
		const setDataB = (mock.view.canvas.nodes.get("node-b") as any).setData;
		expect(setDataA).toHaveBeenCalledOnce();
		expect(setDataB).toHaveBeenCalledOnce();
		const argsA = setDataA.mock.calls[0][0];
		const argsB = setDataB.mock.calls[0][0];
		expect(argsA.text).toContain("first");
		expect(argsA.text).not.toContain("second");
		expect(argsB.text).toContain("second");
		expect(argsB.text).not.toContain("first");
	});

	it("loud failure on api exception — returns ok:false reason:exception", () => {
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "n1", text: "> [!claude] q" },
		]);
		(mock.view.canvas.nodes.get("n1") as any).setData = vi.fn(() => {
			throw new Error("boom");
		});
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [mock as any]);

		const r = writeCanvasReply(
			app,
			"x.canvas",
			"n1",
			"q",
			buildResponseCallout("q", "resp"),
		);
		expect(r.ok).toBe(false);
		expect(r).toMatchObject({ ok: false, reason: "exception" });
	});

	it("calls canvas.requestSave exactly once after setData on success", () => {
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "n1", text: "> [!claude] q" },
		]);
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [mock as any]);

		const r = writeCanvasReply(
			app,
			"x.canvas",
			"n1",
			"q",
			buildResponseCallout("q", "answer"),
		);
		expect(r).toEqual({ ok: true });
		expect(mock.view.canvas.requestSave).toHaveBeenCalledOnce();
	});

	it("returns ok:false reason:probe-failed when canvas absent on the leaf", () => {
		// Leaf for filePath exists but its view.canvas is missing → probe fails.
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [
			{ view: { file: { path: "x.canvas" } as TFile } } as any,
		]);
		const r = writeCanvasReply(
			app,
			"x.canvas",
			"n1",
			"q",
			buildResponseCallout("q", "answer"),
		);
		expect(r.ok).toBe(false);
		expect((r as any).reason).toBe("probe-failed");
	});

	it("returns ok:false reason:no-leaf when no canvas leaf for file", () => {
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => []);
		const r = writeCanvasReply(
			app,
			"x.canvas",
			"n1",
			"q",
			buildResponseCallout("q", "answer"),
		);
		expect(r).toEqual({ ok: false, reason: "no-leaf" });
	});

	it("delivers an arbitrary callout body (error-shaped) through setData when API is healthy — safety net for suggest.ts error UX", () => {
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "n1", text: "> [!claude] q" },
		]);
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [mock as any]);
		const errorBody = `> [!claude] q\n> Channel error: channel down`;
		const r = writeCanvasReply(app, "x.canvas", "n1", "q", errorBody);
		expect(r).toEqual({ ok: true });
		const setDataArg = (mock.view.canvas.nodes.get("n1") as any).setData.mock.calls[0][0];
		expect(setDataArg.text).toContain("channel down");
		expect(setDataArg.text).toContain("[!claude] q");
	});
});

describe("patchCanvasJson (D-04, D-05)", () => {
	it("json patch atomic write via vault.process — id-first match", async () => {
		const app = new App();
		app.vault._seed("test.canvas", SAMPLE_CANVAS_JSON);
		const r = await patchCanvasJson(
			app,
			"test.canvas",
			"node-a",
			"what is x",
			buildResponseCallout("what is x", "the answer is 42"),
		);
		expect(r).toEqual({ ok: true });
		const updated = app.vault._read("test.canvas")!;
		const parsed = JSON.parse(updated);
		expect(parsed.nodes[0].text).toContain("the answer is 42");
		expect(parsed.nodes[0].text).toContain("[!claude-done]");
		// node-b unchanged (same query but different id, ID-first match wins)
		expect(parsed.nodes[1].text).toBe("> [!claude] what is x");
		// node-c unchanged
		expect(parsed.nodes[2].text).toBe("Just some user prose, not a claude callout.");
	});

	it("matches by id first, falls back to query text when id is null", async () => {
		const app = new App();
		app.vault._seed("test.canvas", SAMPLE_CANVAS_JSON);
		const r = await patchCanvasJson(
			app,
			"test.canvas",
			null,
			"what is x",
			buildResponseCallout("what is x", "fallback wins"),
		);
		expect(r).toEqual({ ok: true });
		const parsed = JSON.parse(app.vault._read("test.canvas")!);
		// First matching node by query text is node-a — node-b should still be pending.
		expect(parsed.nodes[0].text).toContain("fallback wins");
		expect(parsed.nodes[1].text).toBe("> [!claude] what is x");
	});

	it("preserves non-target nodes verbatim", async () => {
		const app = new App();
		app.vault._seed("test.canvas", SAMPLE_CANVAS_JSON);
		await patchCanvasJson(
			app,
			"test.canvas",
			"node-a",
			"what is x",
			buildResponseCallout("what is x", "answer"),
		);
		const parsed = JSON.parse(app.vault._read("test.canvas")!);
		// node-b: id, type, coords, dimensions, text all preserved
		expect(parsed.nodes[1]).toEqual({
			id: "node-b",
			type: "text",
			x: 300,
			y: 0,
			width: 250,
			height: 60,
			text: "> [!claude] what is x",
		});
		// node-c: identical
		expect(parsed.nodes[2]).toEqual({
			id: "node-c",
			type: "text",
			x: 0,
			y: 100,
			width: 250,
			height: 60,
			text: "Just some user prose, not a claude callout.",
		});
		// edges unchanged
		expect(parsed.edges).toEqual([]);
	});

	it("preserves tab indentation in output", async () => {
		const app = new App();
		app.vault._seed("test.canvas", SAMPLE_CANVAS_JSON);
		await patchCanvasJson(
			app,
			"test.canvas",
			"node-a",
			"what is x",
			buildResponseCallout("what is x", "answer"),
		);
		const updated = app.vault._read("test.canvas")!;
		expect(updated).toMatch(/\n\t"nodes":/);
		expect(updated).toMatch(/\n\t\t\{/);
	});

	it("returns ok:false reason:no-file when path unknown", async () => {
		const app = new App();
		const r = await patchCanvasJson(
			app,
			"missing.canvas",
			"node-a",
			"q",
			buildResponseCallout("q", "answer"),
		);
		expect(r).toEqual({ ok: false, reason: "no-file" });
	});

	it("returns ok:false reason:parse-error when JSON malformed", async () => {
		const app = new App();
		app.vault._seed("broken.canvas", "not json");
		const r = await patchCanvasJson(
			app,
			"broken.canvas",
			"node-a",
			"q",
			buildResponseCallout("q", "answer"),
		);
		expect(r.ok).toBe(false);
		expect((r as any).reason).toBe("parse-error");
		// Original content preserved (callback returned `data` unchanged on parse failure)
		expect(app.vault._read("broken.canvas")).toBe("not json");
	});

	it("returns ok:false reason:no-match when no node matches id or query", async () => {
		const app = new App();
		app.vault._seed("test.canvas", SAMPLE_CANVAS_JSON);
		const r = await patchCanvasJson(
			app,
			"test.canvas",
			"nonexistent-id",
			"unrelated query that no node has",
			buildResponseCallout("unrelated query that no node has", "answer"),
		);
		expect(r).toEqual({ ok: false, reason: "no-match" });
		// File contents unchanged on no-match
		expect(app.vault._read("test.canvas")).toBe(SAMPLE_CANVAS_JSON);
	});
});

describe("deliverCanvasReply (orchestration)", () => {
	it("uses Canvas API when leaf is open", async () => {
		const mock = makeCanvasViewMock("x.canvas", [
			{ id: "node-a", text: "> [!claude] what is x" },
		]);
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => [mock as any]);
		// Seed file too — but we should NOT touch it because the API path handles it.
		app.vault._seed("x.canvas", SAMPLE_CANVAS_JSON);
		const processSpy = vi.spyOn(app.vault, "process");

		const r = await deliverCanvasReply(
			app,
			"x.canvas",
			"node-a",
			"what is x",
			buildResponseCallout("what is x", "via API"),
		);
		expect(r).toEqual({ ok: true });
		expect(
			(mock.view.canvas.nodes.get("node-a") as any).setData,
		).toHaveBeenCalledOnce();
		expect(processSpy).not.toHaveBeenCalled();
		// Vault content untouched
		expect(app.vault._read("x.canvas")).toBe(SAMPLE_CANVAS_JSON);
	});

	it("falls back to JSON patch when no canvas leaf for file", async () => {
		const app = new App();
		app.workspace.getLeavesOfType = vi.fn(() => []);
		app.vault._seed("x.canvas", SAMPLE_CANVAS_JSON);
		const r = await deliverCanvasReply(
			app,
			"x.canvas",
			"node-a",
			"what is x",
			buildResponseCallout("what is x", "via JSON"),
		);
		expect(r).toEqual({ ok: true });
		const updated = app.vault._read("x.canvas")!;
		expect(updated).toContain("via JSON");
	});

	it("does NOT fall back on probe-failed (D-08 loud failure)", async () => {
		const app = new App();
		// Leaf for filePath exists but its view.canvas is missing → probe fails.
		app.workspace.getLeavesOfType = vi.fn(() => [
			{ view: { file: { path: "x.canvas" } as TFile } } as any,
		]);
		app.vault._seed("x.canvas", SAMPLE_CANVAS_JSON);

		const processSpy = vi.spyOn(app.vault, "process");
		const r = await deliverCanvasReply(
			app,
			"x.canvas",
			"node-a",
			"what is x",
			buildResponseCallout("what is x", "answer"),
		);
		expect(r.ok).toBe(false);
		expect((r as any).reason).toBe("probe-failed");
		expect(processSpy).not.toHaveBeenCalled();
		// File untouched
		expect(app.vault._read("x.canvas")).toBe(SAMPLE_CANVAS_JSON);
	});
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
