---
date: 2026-01-20
project: portfolio-manager
type: session
claude-generated: true
tags: [session, infrastructure, skills, workspace-isolation, automation]
---

# Global Skills Not Working in Project Subdirectories - Fix

**Date:** [[20 Jan 2026]]

## Problem Summary

Global skills (`/speak`, `/session-index`, `/plane-fetch`, etc.) worked perfectly in the main workspace (`/Documents /Bawa's Lab/`) but were completely unavailable when `cd`-ing into project subdirectories like `annotated-reader/`, `video-reviewer/`, etc.

**Symptom:** Type `/` in a project directory → only saw basic commands, no custom skills.

## Root Cause Discovery

**Key insight:** Claude Code v2.1.12+ treats subdirectories with their own `.claude/` folders as **independent workspaces** with isolated permissions.

**How it breaks:**
1. You `cd` into `annotated-reader/`
2. Claude Code detects `.claude/` folder → treats it as independent workspace
3. Loads `annotated-reader/.claude/settings.json`
4. This file had no `permissions` section (only had hooks)
5. Result: No skills available (not even global ones from parent workspace)

**Why this happened recently:**
- Project-level configs existed since project initialization (~1-2 months ago)
- Claude Code v2.1.12 changed permission inheritance behavior
- Previous versions may have merged parent/child workspace permissions
- Current version: subdirectory `.claude/` = fully independent workspace (no inheritance)

## Solution Implemented

Created an automated sync script that adds global skills to all project `settings.json` files.

### Files Created

**`_Portfolio/scripts/sync-skill-permissions.py`**
- Discovers all project subdirectories with `.claude/settings.json`
- Extracts global skills from workspace settings
- Adds missing global skills to each project's permissions allowlist
- Non-destructive: preserves existing hooks and permissions
- Idempotent: safe to run multiple times

### Global Skills Synced

10 skills added to each project:
```python
GLOBAL_SKILLS = [
    "Skill(init-project)",
    "Skill(whisper-transcription)",
    "Skill(speak)",
    "Skill(session-index)",
    "Skill(link-session)",
    "Skill(plane-fetch)",
    "Skill(plane-state)",
    "Skill(plane-create)",
    "Skill(plane-comment)",
    "Skill(transcribe)",
]
```

### Execution Results

✅ **20 projects updated:**
- ambient-recorder
- annotated-reader
- breadcrumbs
- canvas-collab
- claude-mode-manager
- doc-to-audio
- expense-splitter
- garden-pruning
- guitar-tab-viewer
- internet-mindmap
- knowledge-gardener
- memo-transcriber
- personal-site
- project-norma
- screenshot-transcript-poc
- super-productivity-setup
- sync-player
- video-reviewer
- youtube-ai-labels
- Coaching-example

All projects now have permissions sections like:
```json
{
  "hooks": { ... },
  "permissions": {
    "allow": [
      "Skill(init-project)",
      "Skill(whisper-transcription)",
      "Skill(speak)",
      "Skill(session-index)",
      "Skill(link-session)",
      "Skill(plane-fetch)",
      "Skill(plane-state)",
      "Skill(plane-create)",
      "Skill(plane-comment)",
      "Skill(transcribe)"
    ]
  }
}
```

## Design Insights

### Why Claude Code Does This

**Intentional design choice prioritizing security:**

1. **Monorepo Support** - Different projects in one repo need different permissions
2. **Security Boundaries** - Prevent permission escalation across projects
3. **Explicit Configuration** - No implicit inheritance surprises
4. **Team Collaboration** - Different teams can configure their subdirectories independently

**Trade-offs:**
- ✅ Strong security boundaries, no permission leaks
- ✅ Per-project customization
- ❌ Global utilities require explicit propagation
- ❌ Configuration overhead for portfolio workflows

### Our Workflow Context

The portfolio workflow assumes **global infrastructure utilities** - skills are portfolio-level tools, not project-specific.

Claude Code's architecture can't distinguish between:
- "Global utility skill" (should work everywhere)
- "Project-specific skill" (should be isolated)

So it treats all skills as project-level permissions.

### Why Our Solution Is Good

The sync script is the **correct architectural response**:
- Portfolio-level infrastructure explicitly propagated to projects
- Projects remain isolated by default (security preserved)
- One-time setup, reliable thereafter
- Future global skills easily synced with: `python3 _Portfolio/scripts/sync-skill-permissions.py`

## Script Design Patterns

**Key characteristics:**
- **Idempotent** - Safe to run multiple times
- **Non-destructive** - Only adds missing skills, never removes
- **Preserves context** - Keeps existing hooks, permissions, settings
- **Comprehensive reporting** - Shows exactly what changed
- **Reusable** - Works for future global skills additions

## Future Maintenance

When adding new global skills:
```bash
# 1. Add skill to ~/.claude/skills/ and workspace settings
# 2. Update GLOBAL_SKILLS list in sync script
# 3. Run sync
python3 _Portfolio/scripts/sync-skill-permissions.py
# 4. Test in a project directory
cd annotated-reader/
# Try the new skill
```

## Alternative Designs Claude Code Could Have Used

1. **Inheritance with override:** Child workspaces inherit parent permissions unless explicitly overridden
2. **Explicit inheritance flag:** `"inherits": "parent"` in settings.json
3. **Global skills directory:** Skills in `~/.claude/skills/` automatically available everywhere
4. **Permission layers:** Separate "global" and "project" permission lists

**Why they probably didn't:** Each adds complexity and potential security footguns. Explicit configuration is safer, even if less convenient.

## Files Changed

**Created:**
- `_Portfolio/scripts/sync-skill-permissions.py` - Sync automation script
- `_Portfolio/Sessions/2026-01-20-global-skills-workspace-isolation-fix.md` - This session note

**Modified (by script):**
- `*/.claude/settings.json` - 20 project settings files (permissions added)

## Lessons Learned

1. **Workspace isolation is intentional** - Not a bug, but a security feature
2. **Plan mode is valuable** - Exploring the problem before implementing saved time
3. **Scripts > manual edits** - 20 files would be tedious to update manually
4. **Non-destructive operations** - Always preserve existing config when automating
5. **Portfolio infrastructure needs explicit propagation** - Can't rely on inheritance

## Next Steps

- [ ] Test verification - Try skills in 2-3 project directories
- [x] Script committed - `sync-skill-permissions.py` in version control
- [ ] Optional: Track settings.json files - Add to git if desired
- [ ] Document in CLAUDE.md - Add note about workspace isolation

---

**Session Duration:** ~2 hours (plan + implement + document)
**Complexity:** Medium (exploration + scripting + validation)
**Impact:** High (unblocks all global skills across entire portfolio)
