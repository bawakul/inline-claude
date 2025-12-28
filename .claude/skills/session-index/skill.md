# Session Index - Query Past Sessions

**Type:** Portfolio Infrastructure Skill
**Scope:** All projects (portfolio-manager and individual projects)
**Auto-invoke:** Yes - when asking about past decisions or context

## Purpose

Query the searchable session index to:
- Load relevant past sessions at conversation start
- Answer "what did we decide about X?" questions
- Find sessions by project, date, tags, or keywords
- Track portfolio activity patterns
- Recover context from previous work

## The Session Index

**Location:** `_Portfolio/session-index.json`

A searchable JSON index of all session notes that auto-updates via SessionEnd hook. Contains:
- All sessions from `_Portfolio/Sessions/` (portfolio-manager sessions)
- All sessions from project `Sessions/` directories (project-specific sessions)
- Full metadata: filename, date, project, tags, title, content, word count, path

**Auto-updated:** Rebuilds automatically when any Claude Code session ends

## Usage

```bash
# Get recent sessions
/session-index --recent 5

# Find sessions for a specific project
/session-index --project annotated-reader

# Search by keywords
/session-index --search "onlook" "visual editor"

# Filter by date range
/session-index --since 2025-12-15

# Filter by tags
/session-index --tags implementation infrastructure

# Combine filters
/session-index --project video-reviewer --tags planning --since 2025-12-01

# Get full content (not just summaries)
/session-index --project sync-player --full
```

## When to Use This Skill

### Auto-invoke (Proactive Use)

**At conversation start:**
- If user mentions "where we left off" → Query recent sessions for current project
- If user asks "what did we decide about X" → Search for keyword X
- If user references past work → Load relevant sessions

**During conversation:**
- User asks about past decisions or implementations
- Need to understand project history
- Looking for patterns across sessions
- Want to avoid repeating past mistakes

### Examples

**User:** "What did we decide about date formats?"
**Claude:** Uses `/session-index --search "date format"` to find relevant sessions

**User:** "Where did we leave off with the init-project skill?"
**Claude:** Uses `/session-index --project portfolio-manager --search "init-project" --recent 10`

**User:** "Show me all planning sessions from December"
**Claude:** Uses `/session-index --tags planning --since 2025-12-01`

## Output Formats

### Default (Summary)
```
Found 3 sessions matching your query:

1. Session Index Implementation (2025-12-21)
   Project: portfolio-manager
   Tags: session, implementation, infrastructure, indexing
   Preview: Built a searchable JSON index of all session notes that auto-updates...
   Path: _Portfolio/Sessions/2025-12-21-session-index-implementation.md

2. Onlook Setup (2025-12-20)
   Project: portfolio-manager
   Tags: session, infrastructure, tooling
   Preview: Set up Onlook - an open-source visual editor for Next.js...
   Path: _Portfolio/Sessions/2025-12-20-onlook-setup.md

[2 more sessions...]
```

### Full Content (`--full`)
Returns complete session markdown including all content (use for deep context loading)

### JSON (`--format json`)
Returns structured JSON for programmatic processing

## Query Options

### Filters
- `--project <name>` - Filter by project name (e.g., "annotated-reader", "portfolio-manager")
- `--since <date>` - Sessions on or after date (YYYY-MM-DD format)
- `--until <date>` - Sessions on or before date (YYYY-MM-DD format)
- `--tags <tag1> <tag2>...` - Filter by tags (matches ANY tag)
- `--search <keyword1> <keyword2>...` - Search in title and content (matches ALL keywords)

### Display
- `--recent <n>` - Return only n most recent sessions (default: all matching)
- `--full` - Include full content (default: preview only)
- `--format <json|text>` - Output format (default: text)

### Special
- `--stats` - Show index statistics (total sessions, projects, date range)
- `--rebuild` - Force rebuild the index (normally auto-updates)

## Implementation

**Script:** `.claude/skills/session-index/query-sessions.py`

**How it works:**
1. Reads `_Portfolio/session-index.json`
2. Applies filters (project, date, tags)
3. Searches content if keywords provided
4. Sorts by date (newest first)
5. Returns formatted results

**Dependencies:** Python 3, standard library only (json, datetime, argparse)

## Integration with Projects

### Portfolio-Manager
Uses this skill to:
- Track infrastructure development across sessions
- Answer "what did we build when" questions
- Generate portfolio summaries
- Load context for continuing work

### Individual Projects
Uses this skill to:
- Load project-specific session history at conversation start
- Find past decisions about implementation approach
- Avoid re-discussing already-decided topics
- Understand evolution of the project

## Future Enhancements

**Planned (v2):**
- Include Claude.ai conversation exports in the index
- Semantic search using embeddings
- Cross-project insights ("find all sessions about authentication")
- Session clustering (group related work)

## Technical Notes

**Index rebuild:**
- Automatic via `.claude/hooks/session-end`
- Manual via `python3 _Portfolio/scripts/build-session-index.py`
- Or via `--rebuild` flag in this skill

**Performance:**
- Fast enough for hundreds of sessions (~150KB JSON, instant search)
- Full-text search uses simple string matching (good enough for now)
- May add indexing if corpus grows to thousands of sessions

**Error handling:**
- If index doesn't exist, suggests rebuilding
- If no sessions match, returns empty result with helpful message
- Gracefully handles malformed queries

## Examples in Context

### Scenario 1: Starting Work on a Project

**User opens annotated-reader project:**

```
User: "Let's continue where we left off"

Claude (internal): Should load recent sessions for context
Claude invokes: /session-index --project annotated-reader --recent 5

[Returns last 5 sessions showing the POC implementation and architecture planning]

Claude: "Based on your recent sessions, you've set up the architecture plan
and decided to start with Option 1 (text box → map proof-of-concept). The plan
is at ~/.claude/plans/buzzing-crunching-rocket.md. Ready to implement?"
```

### Scenario 2: Answering Decision Questions

```
User: "What was our approach to handling historical place names?"

Claude invokes: /session-index --search "historical place names" "geocoding"

[Finds session discussing Nominatim fallback and custom place database]

Claude: "In the annotated-reader planning session from Dec 9, we decided on
a best-effort approach: start with Nominatim for geocoding, cache manual
corrections, and build a custom place database over time for historical
locations like 'Urfa Valley' or 'Fertile Crescent'."
```

### Scenario 3: Portfolio-Level Insights

```
User: "What projects did I work on in December?"

Claude invokes: /session-index --since 2025-12-01 --format json

[Processes JSON to extract unique projects]

Claude: "In December, you worked on 6 projects:
- sync-player (4 sessions - shipped marker-based workflow)
- video-reviewer (2 sessions - transcript editor pivot)
- annotated-reader (1 session - architecture planning)
- portfolio-manager (5 sessions - built init-project, session-index)
- onlook (1 session - setup)
- knowledge-gardener (1 session - GitHub workflow)"
```

## Best Practices

**For Claude instances using this skill:**

1. **Be proactive** - Invoke when context would be helpful, don't wait for user to ask
2. **Use specific queries** - Narrow down with project + tags + keywords
3. **Summarize results** - Don't dump raw session content, extract relevant info
4. **Link to files** - Always provide paths so user can read full sessions
5. **Respect rate limits** - Don't query unnecessarily, cache results in conversation

**For users:**

- Trust that Claude will load relevant context automatically
- You can explicitly ask for session history: "Show me past work on X"
- Session index updates automatically, no manual maintenance needed

---

**Status:** Testing phase (built 2025-12-21)
**Maintained by:** Portfolio-manager Claude
**Questions?** Ask the portfolio-manager about session indexing
