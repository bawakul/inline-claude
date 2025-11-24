#!/bin/bash
#
# new-project.sh - Initialize project boilerplate
#
# Usage: bash _Templates/new-project.sh <name> <type> <description>
#
# This script handles the mechanical parts of project initialization:
# - Directory structure
# - Static files (.gitignore, settings.json)
# - Portfolio tracking file (frontmatter only)
# - Hook setup
# - Git init and GitHub push
#
# The LLM handles context-aware files separately:
# - .claude/CLAUDE.md
# - README.md
# - Type-specific file (SPEC.md, LEARNING.md, etc.)

set -e  # Exit on error

# Arguments
PROJECT_NAME="$1"
PROJECT_TYPE="$2"
PROJECT_DESCRIPTION="$3"

# Validate arguments
if [ -z "$PROJECT_NAME" ] || [ -z "$PROJECT_TYPE" ] || [ -z "$PROJECT_DESCRIPTION" ]; then
    echo "Error: Missing arguments"
    echo "Usage: bash _Templates/new-project.sh <name> <type> <description>"
    exit 1
fi

# Get today's date
TODAY=$(date +%Y-%m-%d)

# Convert project name to Title Case (e.g., "reading-companion" -> "Reading Companion")
PROJECT_TITLE=$(echo "$PROJECT_NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1')

# Convert type to next action
case "$PROJECT_TYPE" in
    "product")
        NEXT_ACTION="Refine SPEC.md with user requirements"
        ;;
    "personal-tool")
        NEXT_ACTION="Define usage patterns in USAGE.md"
        ;;
    "experiment")
        NEXT_ACTION="Set learning goals in LEARNING.md"
        ;;
    "design")
        NEXT_ACTION="Gather visual inspiration in INSPIRATION.md"
        ;;
    *)
        NEXT_ACTION="Define project goals"
        ;;
esac

# Get script directory (where _Templates lives)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORTFOLIO_ROOT="$(dirname "$SCRIPT_DIR")"

# Project paths
PROJECT_DIR="$PORTFOLIO_ROOT/$PROJECT_NAME"

echo "Creating project: $PROJECT_NAME"
echo "Type: $PROJECT_TYPE"
echo ""

# 1. Create directory structure
echo "→ Creating directories..."
mkdir -p "$PROJECT_DIR/Sessions"
mkdir -p "$PROJECT_DIR/.claude/hooks"

# 2. Create .gitignore
echo "→ Creating .gitignore..."
cat > "$PROJECT_DIR/.gitignore" << 'GITIGNORE'
# Dependencies
node_modules/
venv/
env/
__pycache__/

# Environment
.env
.env.local

# OS Files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Build outputs
dist/
build/
*.pyc
*.pyo

# Logs
*.log
npm-debug.log*
GITIGNORE

# 3. Create portfolio tracking file (frontmatter only)
echo "→ Creating $PROJECT_NAME.md..."
cat > "$PROJECT_DIR/$PROJECT_NAME.md" << EOF
---
status: active
project_type: $PROJECT_TYPE
last_worked: $TODAY
next_action: "$NEXT_ACTION"
repo: "https://github.com/bawakul/$PROJECT_NAME"
tags: [bawa-notes]
---

# $PROJECT_TITLE - Notes

## Overview
[Brief description of what this project is and why it exists]

## Current Status
[What's working, what's blocked, what's next]

## Running Notes
[Your running notes, session summaries, and project context go here]
EOF

# 4. Copy hook script and create settings.json
echo "→ Setting up session auto-load hook..."
cp "$SCRIPT_DIR/load-last-session.py" "$PROJECT_DIR/.claude/hooks/load-last-session.py"
chmod +x "$PROJECT_DIR/.claude/hooks/load-last-session.py"

cat > "$PROJECT_DIR/.claude/settings.json" << 'SETTINGS'
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "./.claude/hooks/load-last-session.py"
      }]
    }]
  }
}
SETTINGS

# 5. Git init and commit
echo "→ Initializing git repository..."
cd "$PROJECT_DIR"
git init --quiet

git add .
git commit --quiet -m "Initial project setup

- Initialize project structure
- Add Claude configuration
- Add project documentation
- Add $PROJECT_NAME.md for portfolio tracking
- Create Sessions/ folder for development logs

🤖 Generated with Claude Code"

# 6. Create GitHub repo and push
echo "→ Creating GitHub repository..."
if command -v gh &> /dev/null; then
    gh repo create "$PROJECT_NAME" --private --source=. --remote=origin --push 2>/dev/null || {
        echo "⚠️  GitHub repo creation failed. You may need to create it manually."
        echo "   gh repo create $PROJECT_NAME --private --source=. --remote=origin --push"
    }
else
    echo "⚠️  gh CLI not found. Create repo manually:"
    echo "   1. Create repo at https://github.com/new"
    echo "   2. git remote add origin git@github.com:bawakul/$PROJECT_NAME.git"
    echo "   3. git push -u origin main"
fi

# 7. Confirmation
echo ""
echo "✓ Project initialized: $PROJECT_NAME"
echo "✓ Type: $PROJECT_TYPE"
echo "✓ Portfolio tracking: $PROJECT_NAME.md"
echo "✓ Sessions folder ready"
echo "✓ Hook configured"
echo ""
echo "LLM should have created:"
echo "  - .claude/CLAUDE.md"
echo "  - README.md"
case "$PROJECT_TYPE" in
    "product") echo "  - SPEC.md" ;;
    "personal-tool") echo "  - USAGE.md" ;;
    "experiment") echo "  - LEARNING.md" ;;
    "design") echo "  - INSPIRATION.md" ;;
esac
