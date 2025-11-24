# Project Initializer

Initialize a new project with proper structure, Claude configuration, and GitHub integration.

## Process Overview

This skill uses a **hybrid approach**:
- **LLM writes** context-aware files (CLAUDE.md, README.md, type-specific file)
- **Script handles** mechanical tasks (directories, git, GitHub, static files)

### 1. Gather Project Information

Use the AskUserQuestion tool to collect:

**Project Name:**
- Question: "What should the project be called?"
- Header: "Project Name"
- Options: Suggest 2-3 names based on conversation, or "Other"
- Store as: lowercase-with-hyphens format

**Project Type:**
- Question: "What type of project is this?"
- Header: "Project Type"
- Options:
  - "Product" - User-facing app/service with spec-driven development
  - "Personal Tool" - Scripts/automation for your own use
  - "Experiment" - Prototype/learning/quick experiment
  - "Design" - Creative coding/design system/visual project

If there's been prior conversation about the project, infer the description from context. Otherwise ask:

**Project Description:**
- Question: "What is the project vision/description?"
- Header: "Description"
- Options: "Use 'Other' to type the description"

### 2. Create Project Directory

```bash
mkdir -p "{project-name}/.claude"
```

### 3. Write .claude/CLAUDE.md (LLM-Generated)

Write a CLAUDE.md file that incorporates conversation context. Use this template as a base, but **add project-specific sections** based on what was discussed:

```markdown
# Development Partner - {Project Name}

You are a **development partner** for this {project-type} project. Your role is to help **design, implement, test, and ship features** while maintaining good practices and project momentum.

## Project Vision

{description - expand based on conversation context}

## GitHub Repository

**Repository:** https://github.com/bawakul/{project-name}

Use `gh` CLI for GitHub operations (issues, PRs, etc). When inside this project directory, commands like `gh issue list` will auto-detect this repository.

## Your Role

### What You DO:
- Help plan and break down tasks
- Write and implement features
- Maintain project structure and organization
- Manage git workflow (commits, branches, PRs)
- Track progress and push toward completion
- Suggest next steps and priorities
- Keep documentation updated
- Ensure code quality and testing

### What You DON'T Do:
- Over-engineer solutions - prefer simple and pragmatic
- Add unnecessary complexity or abstractions
- Ignore explicit project requirements or constraints

## File Editing Boundaries

**IMPORTANT: DO NOT edit `{project-name}.md` directly.**

This file contains project notes and context. The portfolio manager reads this file to track project status, but project Claude instances should:
- ✅ READ the file to understand context
- ❌ NEVER write to or modify this file
- ✅ Suggest content for the user to add

## Project Type: {Project Type}

{type-specific-guidance - see below}

{ADD CUSTOM SECTIONS HERE based on conversation:
- Technical directions discussed
- Key constraints mentioned
- Specific approaches to try
- Integration points
- etc.}

## Communication Style
- Direct and practical
- Focus on shipping and completion
- Ask clarifying questions when ambiguous
- Suggest concrete next actions

## Session Tracking

After each session, write session notes in `Sessions/YYYY-MM-DD-description.md`. **Ask for permission** before writing session notes. Session frontmatter:
```yaml
---
date: YYYY-MM-DD
project: {project-name}
type: session
claude-generated: true
tags: [session, planning/implementation/decision]
---
```
```

**Type-Specific Guidance to include:**

- **Product**: Spec-driven development, write/update SPEC.md before implementing, think about UX and edge cases
- **Personal Tool**: Pragmatic solutions, document usage in USAGE.md, make it work first
- **Experiment**: Document learnings in LEARNING.md, iterate quickly, capture insights
- **Design**: Maintain visual references in INSPIRATION.md, document design decisions

### 4. Write README.md (LLM-Generated)

Write a README that captures the project vision. Include:
- Project name and description (from conversation context)
- The problem being solved
- The approach/idea
- Project type and status
- Basic structure overview

Keep it concise but informative.

### 5. Write Type-Specific File (LLM-Generated)

Based on project type, create the appropriate file **with content informed by the conversation**:

| Type | File | Purpose |
|------|------|---------|
| Product | SPEC.md | Requirements, user stories, features, technical approach |
| Personal Tool | USAGE.md | What it does, how to use, configuration, examples |
| Experiment | LEARNING.md | Goals, questions to explore, technical options to try |
| Design | INSPIRATION.md | Vision, visual references, color/typography, decisions |

**Important:** Don't just use placeholder text. If there was discussion about technical approaches, features, or goals, incorporate that into these files.

### 6. Run the Setup Script

After writing the LLM-generated files, run the script to handle everything else:

```bash
bash "_Templates/new-project.sh" "{project-name}" "{project-type}" "{description}"
```

The script handles:
- Directory structure (Sessions/, .claude/hooks/)
- .gitignore (static)
- {project-name}.md (portfolio tracking frontmatter)
- Hook setup (copy script, settings.json)
- Git init, add, commit
- GitHub repo create and push
- Confirmation output

### 7. Report Result

After the script completes, summarize:

```
✓ Project initialized: {project-name}
✓ Type: {project-type}
✓ GitHub: https://github.com/bawakul/{project-name}

Files created:
- .claude/CLAUDE.md (project-specific guidance)
- README.md
- {type-specific-file}
- {project-name}.md (portfolio tracking)

Next: cd {project-name} && start building!
```

## Implementation Notes

- Write LLM files BEFORE running the script (script does git add .)
- Use conversation context to make files more useful than generic templates
- Quote all paths in bash commands (portfolio has spaces in path)
- The script handles errors gracefully with fallback instructions
