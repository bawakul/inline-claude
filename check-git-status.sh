#!/bin/bash

# Check git status across all projects
cd "/Users/bharadwajkulkarni/Documents /Bawa's Lab"

for dir in */; do
    # Skip non-directories and hidden folders
    [[ ! -d "$dir" ]] && continue
    [[ "$dir" == "."* ]] && continue

    project="${dir%/}"

    # Check if it's a git repo
    if [ -d "$dir.git" ]; then
        cd "$dir"

        echo "=== $project ==="

        # Check for remote
        remote=$(git remote get-url origin 2>/dev/null)
        if [ -z "$remote" ]; then
            echo "  ❌ NO GITHUB REMOTE"
        else
            echo "  📍 Remote: $remote"
        fi

        # Check for uncommitted changes
        if ! git diff-index --quiet HEAD -- 2>/dev/null; then
            echo "  ⚠️  Uncommitted changes"
        fi

        # Check for unpushed commits
        local_commits=$(git rev-list @{u}.. 2>/dev/null | wc -l)
        if [ $? -eq 0 ] && [ $local_commits -gt 0 ]; then
            echo "  📤 $local_commits commit(s) to push"
        fi

        # Check branch
        branch=$(git branch --show-current)
        echo "  🌿 Branch: $branch"

        echo ""
        cd ..
    fi
done
