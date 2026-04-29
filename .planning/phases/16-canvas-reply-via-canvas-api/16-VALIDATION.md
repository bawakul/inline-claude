---
phase: 16
slug: canvas-reply-via-canvas-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- src/__tests__/canvas.test.ts --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/__tests__/canvas.test.ts --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _Filled by planner_ | _ | _ | _ | _ | _ | _ | _ | _ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__mocks__/obsidian.ts` — extend with `Canvas`, `CanvasNode`, `CanvasView` mock shapes (nodes Map, getData/setData, requestSave, contentEl)
- [ ] `src/__tests__/canvas.test.ts` — new test file for `writeCanvasReply`, probe, JSON-patch fallback
- [ ] No new framework install — vitest already configured

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Same-leaf canvas reply round-trip | D-01, D-02, primary write | Requires real Obsidian Canvas runtime | 1) Open `.canvas` file. 2) Trigger `;;test` inside a text node. 3) Verify `[!claude-done]` callout appears in same node. |
| Background-leaf canvas reply | Primary write | Requires multi-leaf Obsidian state | 1) Open `.canvas` in leaf A. 2) Open markdown note in leaf B (focus). 3) Trigger `;;test` from canvas leaf. 4) Verify reply lands in canvas node. |
| Closed-leaf JSON-patch fallback | D-04, D-05 | Requires file-write race timing | 1) Open `.canvas`, trigger `;;test`. 2) Close canvas leaf before reply arrives. 3) Re-open canvas. 4) Verify reply present in node. 5) Verify any concurrent edits preserved. |
| Loud failure on probe rejection | D-07, D-08 | Requires monkeypatching `view.canvas` to fail probe | 1) Patch `Canvas.prototype.requestSave = undefined`. 2) Trigger `;;test`. 3) Verify error callout AND Notice toast appear. 4) Verify `console.error` logged with full exception. |
| Two callouts with identical query text | D-05 (ID-first locate) | Requires real canvas with duplicate triggers | 1) Trigger `;;same query` twice in different canvas nodes. 2) Verify each reply lands in its originating node, not the other. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (canvas mock, canvas.test.ts)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
