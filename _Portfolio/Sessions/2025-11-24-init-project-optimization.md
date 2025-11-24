---
date: 2025-11-24
project: portfolio-manager
type: session
claude-generated: true
tags: [session, implementation]
---

# Session: /init-project Optimization

## Summary

Optimized the `/init-project` skill by splitting it into a hybrid approach: LLM writes context-aware files, shell script handles mechanical tasks.

## What Changed

### New: `_Templates/new-project.sh`

Shell script that handles:
- Directory structure (Sessions/, .claude/hooks/)
- .gitignore (static)
- `{name}.md` portfolio tracking file (frontmatter only, with title case)
- Hook setup (copy load-last-session.py, create settings.json)
- Git init, add, commit
- GitHub repo create + push

### Updated: `/init-project` skill

Simplified from 478 → 191 lines. Now:
1. Gathers project info via AskUserQuestion
2. Writes 3 context-aware files (CLAUDE.md, README.md, type-specific)
3. Calls `bash _Templates/new-project.sh` for everything else

### Updated: `settings.local.json`

Added `Bash(bash _Templates/new-project.sh:*)` to pre-approved commands for fully automated flow.

## Reasoning

Original process had ~10 steps, all executed by LLM via individual tool calls. Analysis showed:
- 9/10 steps were pure scripting or template substitution
- Only CLAUDE.md and type-specific files benefit from LLM context

The hybrid approach lets LLM focus on what it's good at (incorporating conversation context into project docs) while the script handles boilerplate faster.

## Also This Session

Created `reading-companion` project - a reading companion idea for visualizing geographic/temporal context while reading dense non-fiction like "The Dawn of Everything". Uses OCR/text input → NLP extraction → interactive map/timeline.

## Commits

- `c283f8b` - Optimize /init-project with hybrid script approach
- `03e68f5` - Initial project setup (reading-companion)
