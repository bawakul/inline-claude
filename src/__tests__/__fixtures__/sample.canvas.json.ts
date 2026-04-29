// Hand-built fixture matching the JSON Canvas v1 spec (jsoncanvas.org/spec/1.0).
// Tab-indented to match Obsidian's own writes — see 16-RESEARCH.md §Pattern 4.
//
// Three text nodes:
//   - "node-a": pending claude callout, query "what is x"
//   - "node-b": pending claude callout, SAME query "what is x" (used to prove ID-first matching in D-05)
//   - "node-c": unrelated user prose (used to prove we don't touch non-claude nodes)
//
// Used by patchCanvasJson tests (Plan 16-02) to exercise the closed-leaf JSON
// patch path through the Vault.process atomic primitive (D-04).

export const SAMPLE_CANVAS_JSON: string =
`{
\t"nodes": [
\t\t{
\t\t\t"id": "node-a",
\t\t\t"type": "text",
\t\t\t"x": 0,
\t\t\t"y": 0,
\t\t\t"width": 250,
\t\t\t"height": 60,
\t\t\t"text": "> [!claude] what is x"
\t\t},
\t\t{
\t\t\t"id": "node-b",
\t\t\t"type": "text",
\t\t\t"x": 300,
\t\t\t"y": 0,
\t\t\t"width": 250,
\t\t\t"height": 60,
\t\t\t"text": "> [!claude] what is x"
\t\t},
\t\t{
\t\t\t"id": "node-c",
\t\t\t"type": "text",
\t\t\t"x": 0,
\t\t\t"y": 100,
\t\t\t"width": 250,
\t\t\t"height": 60,
\t\t\t"text": "Just some user prose, not a claude callout."
\t\t}
\t],
\t"edges": []
}`;
