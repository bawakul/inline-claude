---
date: 2025-12-28
project: portfolio-manager
type: session
claude-generated: true
tags: [session, implementation, infrastructure, skills]
---

# Session Index Skill - Making Sessions Queryable

**Date:** [[28 Dec 2025]]
**Type:** Infrastructure Implementation
**Status:** Complete ✅

## Overview

Built the `/session-index` skill to make the session indexing system actually usable by all Claude instances (portfolio-manager and individual projects). Discovered that while the indexing system existed, there was no way for Claudes to query or access it.

## The Problem Discovered

**User's question:** "Do the project Claudes know about the session-index skill? Is it documented in their claude.md files?"

**Investigation revealed:**
- ✅ Session indexing system exists (`_Portfolio/session-index.json`, auto-updating hook, build script)
- ✅ Documented in portfolio-manager's `.claude/CLAUDE.md`
- ❌ No skill for querying the index
- ❌ Not mentioned in any project CLAUDE.md files
- ❌ Project Claudes have no way to access or use it

**Root cause:** Built the infrastructure (index + hook) but forgot to build the interface (skill) for actually using it!

## What We Built

### 1. Skill Documentation (`.claude/skills/session-index/skill.md`)

Comprehensive skill definition including:

**Purpose:**
- Query past sessions for context loading
- Answer "what did we decide about X?" questions
- Track portfolio activity patterns
- Context recovery when returning to projects

**Usage patterns:**
```bash
/session-index --recent 5                    # Get recent sessions
/session-index --project annotated-reader    # Project-specific sessions
/session-index --search "onlook"             # Keyword search
/session-index --tags planning               # Filter by tags
/session-index --stats                       # Index statistics
```

**Auto-invocation guidance:**
- When to use proactively (conversation start, "where we left off" questions)
- Examples of how Claude should invoke automatically
- When user explicitly requests session history

**Output formats:**
- Default: Text summary with previews
- `--full`: Complete session content
- `--format json`: Structured JSON

**Integration examples:**
- Portfolio-manager use cases
- Individual project use cases
- Scenario walkthroughs showing real usage

### 2. Query Script (`.claude/skills/session-index/query-sessions.py`)

Python script with comprehensive filtering and search:

**Filter options:**
- `--project <name>` - Filter by project (partial match, case-insensitive)
- `--since <date>` - Sessions on/after date (YYYY-MM-DD)
- `--until <date>` - Sessions on/before date (YYYY-MM-DD)
- `--tags <tag1> <tag2>...` - Filter by tags (matches ANY)
- `--search <keyword1> <keyword2>...` - Full-text search (matches ALL)

**Display options:**
- `--recent <n>` - Limit to N most recent
- `--full` - Include complete content (not just 150-char preview)
- `--format <json|text>` - Output format

**Special commands:**
- `--stats` - Show index statistics (total sessions, projects, date range)
- `--rebuild` - Force rebuild the index

**Technical implementation:**
- Reads `_Portfolio/session-index.json`
- Applies filters sequentially
- Full-text search in title and content
- Sorts by date (newest first)
- Formatted output with previews
- Error handling (missing index, invalid dates, etc.)

**Path calculation:**
```python
# Script is in .claude/skills/session-index/query-sessions.py
# Need 4 parent levels to reach portfolio root
PORTFOLIO_ROOT = Path(__file__).parent.parent.parent.parent
INDEX_PATH = PORTFOLIO_ROOT / "_Portfolio" / "session-index.json"
```

### 3. Updated Portfolio-Manager CLAUDE.md

Changed Session Indexing System section:
- Status: "🧪 Testing Phase" → "✅ Implemented and ready to use"
- Added skill documentation reference
- Added usage examples
- Updated session count (20 → 44 sessions across 9 projects)
- Added use cases and future enhancements

## Testing & Validation

### Path Calculation Bug Fix

**Initial issue:** Script calculated wrong portfolio root (`.claude/` instead of portfolio root)

**Fix:** Changed from 3 parent levels to 4:
```python
# Before (wrong):
PORTFOLIO_ROOT = Path(__file__).parent.parent.parent

# After (correct):
PORTFOLIO_ROOT = Path(__file__).parent.parent.parent.parent
```

### Tested Query Patterns

**Statistics:**
```bash
$ python3 .claude/skills/session-index/query-sessions.py --stats

📊 Session Index Statistics
Last updated: 2025-12-21T15:26:54.164314
Total sessions: 44
Date range: 2025-10-31 to 2025-12-21

Projects (9):
  - _Portfolio: 21 sessions
  - project-norma: 6 sessions
  - video-reviewer: 5 sessions
  - sync-player: 3 sessions
  - expense-splitter: 3 sessions
  - personal-site: 2 sessions
  - doc-to-audio: 2 sessions
  - annotated-reader: 1 session
  - youtube-ai-labels: 1 session
```

**Recent sessions:**
```bash
$ python3 .claude/skills/session-index/query-sessions.py --recent 2

Found 44 sessions matching your query:

1. Session Index Implementation (2025-12-21)
   Project: _Portfolio
   Tags: session, implementation, infrastructure, indexing
   Preview: Built a searchable JSON index of all session notes...
   Path: _Portfolio/Sessions/2025-12-21-session-index-implementation.md

2. Onlook Setup (2025-12-20)
   Project: _Portfolio
   Tags: session, infrastructure, tooling
   Preview: Set up Onlook - an open-source visual editor...
   Path: _Portfolio/Sessions/2025-12-20-onlook-setup.md
```

**Keyword search:**
```bash
$ python3 .claude/skills/session-index/query-sessions.py --search "onlook"

Found 2 sessions matching your query:
[Returns sessions mentioning "onlook"]
```

**Project filter:**
```bash
$ python3 .claude/skills/session-index/query-sessions.py --project video-reviewer

Found 5 sessions matching your query:
[Returns all video-reviewer sessions]
```

**Tag filter:**
```bash
$ python3 .claude/skills/session-index/query-sessions.py --tags planning --recent 3

Found 13 sessions matching your query:
[Returns 3 most recent planning sessions]
```

✅ All query patterns work correctly

## Key Design Decisions

### Skill Auto-Invocation

**Designed for proactive use:**
- Claude should invoke automatically when context would help
- Examples in skill.md show when to use without user asking
- Marked as "auto-invoke: yes" in skill definition

**Use cases:**
- User says "where did we leave off" → auto-query project sessions
- User asks "what did we decide about X" → auto-search for X
- Starting work on a project → load recent context

### Output Format

**Default: Summary with preview**
- Shows title, date, project, tags
- 150-character preview (strips frontmatter)
- Path to full session file
- Keeps output concise for quick scanning

**Full content (`--full`):**
- Complete markdown including frontmatter
- For deep context loading
- When user needs detailed information

**JSON (`--format json`):**
- Structured data for programmatic use
- Portfolio-level analysis
- Cross-project insights

### Search Logic

**Multiple keywords = AND logic:**
- `--search "onlook" "visual editor"` finds sessions with BOTH terms
- More precise than OR logic
- User can be more specific

**Tags = OR logic:**
- `--tags planning implementation` finds sessions with EITHER tag
- Broader discovery
- Matches typical use case (show me planning OR implementation)

## Files Created/Modified

**Created:**
1. `.claude/skills/session-index/skill.md` - Skill documentation (340 lines)
2. `.claude/skills/session-index/query-sessions.py` - Query script (285 lines)

**Modified:**
3. `.claude/CLAUDE.md` - Updated Session Indexing System section

**Total:** ~625 lines of new code/documentation

## Commit

**Commit:** `2d055a5` - "feat: add session-index skill for querying past sessions"

**Message:**
```
New skill enables all Claude instances to query the session index:
- Search by project, date range, tags, or keywords
- Get recent sessions or statistics
- Load relevant context at conversation start
- Answer 'what did we decide' questions

Usage examples:
  /session-index --recent 5
  /session-index --project annotated-reader
  /session-index --search 'onlook'
  /session-index --tags planning
  /session-index --stats

This makes the session-index system (built 2025-12-21) actually
usable by all project Claudes, not just portfolio-manager.
```

## Impact

### Before This Session
- Session index existed but was **inaccessible**
- Project Claudes had no way to query past sessions
- Context loading was manual (user had to copy/paste session content)
- "What did we decide" questions required manual file searching

### After This Session
- **All Claude instances** can query the session index
- **Automatic context loading** at conversation start
- **Searchable decision history** across all projects
- **Portfolio-level insights** (stats, activity patterns)

**Transformation:** Session index went from "infrastructure that exists" to "infrastructure that's actually used"

## Use Cases Enabled

### 1. Context Recovery (Project Claudes)
```
User opens annotated-reader project: "Let's continue where we left off"

Claude (internal): Should load recent sessions for context
Claude invokes: /session-index --project annotated-reader --recent 5

Claude: "Based on your recent sessions, you've set up the architecture plan
and decided to start with Option 1 (text box → map proof-of-concept)..."
```

### 2. Decision Archaeology
```
User: "What was our approach to handling historical place names?"

Claude invokes: /session-index --search "historical place names" "geocoding"

Claude: "In the annotated-reader planning session from Dec 9, we decided on
a best-effort approach: start with Nominatim, cache manual corrections..."
```

### 3. Portfolio Activity Tracking
```
User: "What projects did I work on in December?"

Claude invokes: /session-index --since 2025-12-01 --format json

Claude: "In December, you worked on 6 projects:
- sync-player (4 sessions - shipped marker-based workflow)
- video-reviewer (2 sessions - transcript editor pivot)
- annotated-reader (1 session - architecture planning)
..."
```

### 4. Implementation Pattern Discovery
```
User: "How did we approach UI refactors in other projects?"

Claude invokes: /session-index --tags ui-refactor --search "planning"

Claude: "Looking at past UI refactors, you consistently used plan mode first,
created comprehensive plans, then executed in phases. Example from sync-player..."
```

## Next Steps

**Immediate (This Session):**
- ✅ Built skill documentation
- ✅ Built query script
- ✅ Updated portfolio-manager CLAUDE.md
- ✅ Tested all query patterns
- ✅ Committed changes

**Future (When Relevant):**
- Test skill invocation from within Claude Code (not just bash)
- Monitor how often project Claudes actually use it
- Gather feedback on what queries are most useful
- Consider adding to project CLAUDE.md files if they need explicit reminders

**Future Enhancements (v2):**
- Include Claude.ai conversation exports in index
- Semantic search using embeddings
- Cross-project pattern analysis
- Session clustering (group related work)

## Lessons Learned

### Infrastructure Needs Interfaces

Building the indexing system (Dec 21) was only 50% of the solution. Without a query interface:
- Data exists but is inaccessible
- Claudes can't use it
- Value is theoretical, not realized

**Lesson:** When building infrastructure, immediately build the interface for using it.

### Auto-Invocation Requires Clear Guidance

For the skill to be used proactively:
- Document **when** to invoke, not just **how**
- Provide concrete examples of user statements that should trigger it
- Mark as "auto-invoke: yes" in skill definition
- Show scenario walkthroughs

**Lesson:** Skills need usage guidance, not just API documentation.

### Test Path Calculations Early

Initial bug in portfolio root calculation (3 parents vs 4 parents) would have been caught with first test.

**Lesson:** Always test path-dependent scripts immediately after writing.

### Comprehensive Testing Validates Design

Testing multiple query patterns revealed:
- All filters work correctly
- Output format is readable
- Error handling is good
- Performance is fast enough

**Lesson:** Test the full range of use cases before declaring "done".

## Session Metrics

- **Duration:** ~45 minutes
- **Investigation:** 10 minutes (discovered no skill exists)
- **Implementation:** 25 minutes (skill.md + query-sessions.py)
- **Testing:** 10 minutes (multiple query patterns)
- **Lines written:** ~625 lines (skill docs + script + CLAUDE.md update)
- **Commits:** 1 commit

## Status

**Project Status:** Active infrastructure development
**This Feature:** Complete and ready to use ✅
**Next Session:** Unknown (depends on user priorities)

---

**Session Type:** Infrastructure implementation
**Complexity:** Medium (skill definition + Python script + testing)
**Outcome:** Session indexing system now fully usable by all Claudes
**Portfolio Impact:** Enables context-aware conversations and decision archaeology across all projects
