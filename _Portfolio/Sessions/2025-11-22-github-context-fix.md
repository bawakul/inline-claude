---
date: 2025-11-22
project: portfolio-manager
type: session
claude-generated: true
tags: [session, implementation]
---

# GitHub Repository Context Fix

## Problem

Project Claudes were guessing wrong GitHub usernames when trying to access issues/PRs. Example error:

```
gh issue list --repo bharadwajkulkarni/expense-splitter
GraphQL: Could not resolve to a Repository with the name 'bharadwajkulkarni/expense-splitter'
```

The actual username is `bawakul`, but Claude was inferring from system username.

## Solution

Added explicit GitHub Repository section to all project CLAUDE.md files so Claudes don't have to guess.

## Changes Made

### 1. Updated `/init-project` skill template

Added GitHub Repository section after Project Vision:

```markdown
## GitHub Repository

**Repository:** https://github.com/bawakul/{project-name}

Use `gh` CLI for GitHub operations (issues, PRs, etc). When inside this project directory, commands like `gh issue list` will auto-detect this repository.
```

### 2. Updated 7 existing projects

Added the same section to:
- expense-splitter
- youtube-ai-labels
- knowledge-gardener
- claude-mode-manager
- personal-site
- screenshot-transcript-poc
- super-productivity-setup

## Design Decision

Kept it minimal per user request - just the repo name and URL, plus a note about `gh` auto-detection. No extra commands or documentation.

## Outcome

All future project Claudes will have the correct GitHub repo URL visible at the top of their instructions. No more guessing usernames.
