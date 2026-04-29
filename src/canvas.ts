import type { App, Editor, TFile, View } from "obsidian";
import { buildResponseCallout } from "./callout";

// Local Canvas API stubs — runtime shape per
// github.com/Developer-Mike/obsidian-advanced-canvas/blob/main/src/@types/Canvas.d.ts
// (canonical community-maintained type file). Obsidian's bundled obsidian.d.ts
// does NOT declare a Canvas / CanvasView class — only data-shape types in
// obsidian/canvas. Hence we keep these local to src/canvas.ts (per
// 16-PATTERNS.md: "interface stubs in src/canvas.ts, not in the obsidian mock").
interface CanvasTextDataMin {
	id: string;
	type: string;
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
}
interface CanvasNodeMin {
	id: string;
	child?: { data?: string; editor?: Editor };
	contentEl?: HTMLElement;
	getData(): CanvasTextDataMin;
	setData(data: CanvasTextDataMin, addHistory?: boolean): void;
}
interface CanvasMin {
	nodes: Map<string, CanvasNodeMin>;
	requestSave(): void;
}
interface CanvasViewMin extends View {
	canvas?: CanvasMin;
	file?: TFile;
}

export type ProbeResult =
	| { ok: true; canvas: CanvasMin }
	| {
		ok: false;
		reason:
			| "no-canvas"
			| "nodes-not-map"
			| "no-requestSave"
			| "node-setData-missing"
			| "node-getData-missing";
	};

export type CanvasWriteResult =
	| { ok: true }
	| {
		ok: false;
		reason: "no-leaf" | "probe-failed" | "no-match" | "exception";
		error?: unknown;
	};

export type JsonPatchResult =
	| { ok: true }
	| {
		ok: false;
		reason: "no-file" | "no-match" | "parse-error";
		error?: unknown;
	};

// Module-level forensic flag — log child-keys exactly once per plugin load
// to surface the runtime shape of node.child without spamming console (D-01).
let probeLogged = false;

/**
 * Test-only reset for the once-per-session probe-log flag. NOT exported as
 * production API; only consumed by canvas.test.ts to keep tests independent.
 */
export function _resetProbeLogged(): void {
	probeLogged = false;
}

/**
 * Escape a query string for safe inclusion in a RegExp.
 */
function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace a pending `> [!claude] {query}` callout block (one or more `>` lines)
 * with the response callout. Used by both writeCanvasReply (in-memory) and
 * patchCanvasJson (on-disk text). The pending callout in v0.2.0 is a single
 * line, but we tolerate body lines for forward compat.
 *
 * `response` is the FULL callout body (typically the result of
 * buildResponseCallout(query, ...) or buildErrorCallout(query, ...)) — opaque
 * to this helper.
 */
function replacePendingCalloutText(text: string, query: string, response: string): string {
	const pattern = new RegExp(`> \\[!claude\\] ${escapeRegex(query)}(\\n>.*)*`, "m");
	return text.replace(pattern, response);
}

/**
 * Probe the FULL five-shape Canvas API contract per D-08 (corrected — see
 * 16-RESEARCH.md §D-08 Probe Correction; addresses checker warning #4).
 *
 * Checks:
 *   (a) view.canvas exists
 *   (b) view.canvas.nodes is a Map
 *   (c) view.canvas.requestSave is a function
 *   (d) when nodes.size > 0, first sampled node has setData as a function
 *   (e) when nodes.size > 0, first sampled node has getData as a function
 *
 * Sampling the first node lets the standalone probe reject API-rename failures
 * at the per-node level too. Empty-Map canvases are accepted by the standalone
 * probe (writeCanvasReply will return `no-match` separately when there is
 * nothing to write to). This means the standalone probe rejects canvases whose
 * nodes lack the mutation surface — preventing the false-pass case.
 */
export function probeCanvasApi(view: unknown): ProbeResult {
	const v = view as CanvasViewMin | undefined;
	if (!v?.canvas) return { ok: false, reason: "no-canvas" };
	if (!(v.canvas.nodes instanceof Map)) return { ok: false, reason: "nodes-not-map" };
	if (typeof v.canvas.requestSave !== "function") return { ok: false, reason: "no-requestSave" };

	// Per-node sampling: only meaningful when at least one node exists.
	if (v.canvas.nodes.size > 0) {
		const firstNode = v.canvas.nodes.values().next().value as CanvasNodeMin | undefined;
		if (firstNode) {
			if (typeof firstNode.setData !== "function") {
				return { ok: false, reason: "node-setData-missing" };
			}
			if (typeof firstNode.getData !== "function") {
				return { ok: false, reason: "node-getData-missing" };
			}
		}
	}

	return { ok: true, canvas: v.canvas };
}

/**
 * Trigger-time node identification (D-01).
 *
 * Iterates every canvas leaf for filePath, then each node in view.canvas.nodes,
 * comparing node.child.editor === editor. Falls back to DOM containment
 * (node.contentEl.contains(editor.cm.contentDOM)) when node.child.editor is
 * undefined — this is the path RESEARCH Pitfall 2 calls out, and it has a
 * dedicated test (per checker warning #3).
 *
 * Returns the matched node id, or null if no match (D-03 — caller logs warn).
 *
 * Forensic: on first call per plugin load, logs Object.keys(node.child) so we
 * can validate the assumed shape against the real Obsidian runtime.
 */
export function findCanvasNodeIdForEditor(
	app: App,
	filePath: string,
	editor: Editor,
): string | null {
	const leaves = app.workspace.getLeavesOfType("canvas");
	const editorDom: HTMLElement | undefined = (editor as any)?.cm?.contentDOM;
	for (const leaf of leaves) {
		const view = leaf.view as unknown as CanvasViewMin;
		if (!view?.canvas || view.file?.path !== filePath) continue;
		for (const node of view.canvas.nodes.values()) {
			if (!probeLogged) {
				console.log(
					`Inline Claude: first canvas trigger — node.child keys = ${JSON.stringify(
						Object.keys(node.child ?? {}),
					)}`,
				);
				probeLogged = true;
			}
			// Primary: editor-identity match.
			if (node.child?.editor && node.child.editor === editor) return node.id;
			// Fallback: DOM-containment match when child.editor is undefined
			// (per RESEARCH Pitfall 2; tested explicitly per checker #3).
			if (editorDom && node.contentEl?.contains(editorDom as unknown as Node)) {
				return node.id;
			}
		}
	}
	return null;
}

/**
 * Write the response back via the Canvas API (open-leaf path).
 * Implements D-05 (id-first, query-text fallback) and D-07/D-08 (loud failure
 * on probe rejection or exception).
 *
 * The `response` parameter is the FULL callout body (e.g. the result of
 * buildResponseCallout(query, ...) or buildErrorCallout(query, ...)) — opaque
 * to this helper. The pending `> [!claude] {query}` line is replaced by it.
 */
export function writeCanvasReply(
	app: App,
	filePath: string,
	nodeId: string | null,
	query: string,
	response: string,
): CanvasWriteResult {
	const leaves = app.workspace.getLeavesOfType("canvas");
	const leaf = leaves.find((l) => {
		const v = l.view as unknown as CanvasViewMin;
		return v?.file?.path === filePath;
	});
	if (!leaf) return { ok: false, reason: "no-leaf" };

	const probe = probeCanvasApi(leaf.view);
	if (!probe.ok) return { ok: false, reason: "probe-failed", error: probe.reason };

	let node: CanvasNodeMin | undefined;
	if (nodeId) {
		node = probe.canvas.nodes.get(nodeId);
	}
	if (!node) {
		// D-05 query-text fallback
		for (const n of probe.canvas.nodes.values()) {
			let data: CanvasTextDataMin | undefined;
			try {
				data = n.getData?.();
			} catch {
				continue;
			}
			if (
				data?.type === "text"
				&& typeof data.text === "string"
				&& data.text.startsWith(`> [!claude] ${query}`)
			) {
				node = n;
				break;
			}
		}
	}
	if (!node) return { ok: false, reason: "no-match" };
	// Defensive per-node re-check (the probe sampled the FIRST node; the chosen
	// node may differ — though normally probe sampling implies homogeneity).
	if (typeof node.setData !== "function" || typeof node.getData !== "function") {
		return {
			ok: false,
			reason: "probe-failed",
			error: "node-setData-or-getData-missing",
		};
	}

	try {
		const current = node.getData();
		const newText = replacePendingCalloutText(current.text, query, response);
		node.setData({ ...current, text: newText });
		probe.canvas.requestSave();
		return { ok: true };
	} catch (error) {
		return { ok: false, reason: "exception", error };
	}
}

/**
 * Closed-leaf JSON-patch fallback (D-04, upgraded to vault.process per
 * 16-RESEARCH.md §Pattern 4 + §Anti-Pattern 1). Atomic since Obsidian 1.1.0.
 *
 * Preserves tab indentation (real .canvas files use tabs — verified).
 *
 * `response` is the full callout body, opaque to the helper.
 */
export async function patchCanvasJson(
	app: App,
	filePath: string,
	nodeId: string | null,
	query: string,
	response: string,
): Promise<JsonPatchResult> {
	const file = app.vault.getFileByPath(filePath);
	if (!file) return { ok: false, reason: "no-file" };

	let result: JsonPatchResult = { ok: true };

	await app.vault.process(file, (data: string) => {
		try {
			const json = JSON.parse(data) as {
				nodes?: Array<{
					id: string;
					type: string;
					text?: string;
					[k: string]: unknown;
				}>;
				edges?: unknown[];
			};
			const nodes = Array.isArray(json.nodes) ? json.nodes : [];

			// D-05 ID-first
			let target = nodeId
				? nodes.find((n) => n && typeof n === "object" && n.id === nodeId)
				: undefined;

			// D-05 query-text fallback
			if (!target) {
				target = nodes.find(
					(n) =>
						n
						&& typeof n === "object"
						&& n.type === "text"
						&& typeof n.text === "string"
						&& n.text.startsWith(`> [!claude] ${query}`),
				);
			}

			if (!target || target.type !== "text" || typeof target.text !== "string") {
				result = { ok: false, reason: "no-match" };
				return data;
			}

			target.text = replacePendingCalloutText(target.text, query, response);
			return JSON.stringify(json, null, "\t");
		} catch (error) {
			result = { ok: false, reason: "parse-error", error };
			return data;
		}
	});

	return result;
}

/**
 * Dispatch: try Canvas API first, fall back to JSON patch ONLY when the leaf
 * is closed (D-04). All other failure modes bubble — D-08 forbids silent
 * fallback that hides API breakage.
 */
export async function deliverCanvasReply(
	app: App,
	filePath: string,
	nodeId: string | null,
	query: string,
	response: string,
): Promise<CanvasWriteResult | JsonPatchResult> {
	const r = writeCanvasReply(app, filePath, nodeId, query, response);
	if (r.ok) return r;
	if (r.reason === "no-leaf") {
		return await patchCanvasJson(app, filePath, nodeId, query, response);
	}
	return r;
}

// `buildResponseCallout` is imported above per the plan's contract (callers
// pass its output as the `response` parameter to writeCanvasReply /
// patchCanvasJson / deliverCanvasReply). Reference it once here so the import
// participates in compilation even when no helper invokes it directly —
// avoiding a stray-import warning if `noUnusedLocals` is ever enabled.
const _buildResponseCalloutRef: typeof buildResponseCallout = buildResponseCallout;
void _buildResponseCalloutRef;
