#!/usr/bin/env python3
"""
Sync Global Skills to Project Settings

Adds global skills from workspace settings to all project subdirectory settings.json files.
This fixes the issue where skills work in the main workspace but not in project subdirectories.

Problem: When Claude Code enters a subdirectory with .claude/, it treats it as an independent
workspace and doesn't inherit global skills from the parent workspace.

Solution: Explicitly add global skills to each project's permissions.allow list.
"""

import json
import os
from pathlib import Path
from typing import List, Set

# Define workspace root
WORKSPACE_ROOT = Path("/Users/bharadwajkulkarni/Documents /Bawa's Lab")
WORKSPACE_SETTINGS = WORKSPACE_ROOT / ".claude" / "settings.local.json"

# Global skills to sync (extracted from workspace settings)
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


def find_project_settings() -> List[Path]:
    """Find all project subdirectories with .claude/settings.json files."""
    settings_files = []

    # Search for .claude directories in immediate subdirectories
    for item in WORKSPACE_ROOT.iterdir():
        if item.is_dir() and not item.name.startswith('.') and not item.name.startswith('_'):
            settings_file = item / ".claude" / "settings.json"
            if settings_file.exists():
                settings_files.append(settings_file)

    return sorted(settings_files)


def load_settings(settings_file: Path) -> dict:
    """Load settings.json file."""
    try:
        with open(settings_file, 'r') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"  ⚠️  Warning: Invalid JSON in {settings_file}: {e}")
        return {}


def save_settings(settings_file: Path, settings: dict):
    """Save settings.json file with pretty formatting."""
    with open(settings_file, 'w') as f:
        json.dump(settings, f, indent=2)
        f.write('\n')  # Add trailing newline


def sync_permissions(settings_file: Path):
    """Add global skills to project settings if not present."""
    project_name = settings_file.parent.parent.name

    print(f"\n📁 {project_name}")
    print(f"   {settings_file.relative_to(WORKSPACE_ROOT)}")

    # Load current settings
    settings = load_settings(settings_file)

    # Ensure permissions structure exists
    if "permissions" not in settings:
        settings["permissions"] = {}
    if "allow" not in settings["permissions"]:
        settings["permissions"]["allow"] = []

    # Get current allow list
    current_allow: List[str] = settings["permissions"]["allow"]
    current_skills: Set[str] = {p for p in current_allow if p.startswith("Skill(")}

    # Find missing global skills
    missing_skills = [skill for skill in GLOBAL_SKILLS if skill not in current_skills]

    if not missing_skills:
        print(f"   ✅ All global skills already present")
        return False

    # Add missing skills
    settings["permissions"]["allow"].extend(missing_skills)

    # Save updated settings
    save_settings(settings_file, settings)

    print(f"   ➕ Added {len(missing_skills)} global skills:")
    for skill in missing_skills:
        print(f"      - {skill}")

    return True


def main():
    """Main script execution."""
    print("=" * 70)
    print("Global Skills Sync - Portfolio Manager")
    print("=" * 70)
    print(f"\nWorkspace: {WORKSPACE_ROOT}")
    print(f"\nGlobal skills to sync:")
    for skill in GLOBAL_SKILLS:
        print(f"  • {skill}")

    # Find all project settings files
    print(f"\n🔍 Scanning for project settings files...")
    settings_files = find_project_settings()

    if not settings_files:
        print("\n⚠️  No project settings.json files found!")
        return

    print(f"\n📊 Found {len(settings_files)} project(s) with .claude/settings.json")

    # Sync each project
    print("\n" + "=" * 70)
    print("Syncing Permissions")
    print("=" * 70)

    updated_count = 0
    for settings_file in settings_files:
        if sync_permissions(settings_file):
            updated_count += 1

    # Summary
    print("\n" + "=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"✅ {updated_count} project(s) updated")
    print(f"⏭️  {len(settings_files) - updated_count} project(s) already up-to-date")
    print(f"\n📝 Total projects processed: {len(settings_files)}")

    if updated_count > 0:
        print(f"\n💡 Next steps:")
        print(f"   1. Test global skills in a project directory (cd into one and try /speak)")
        print(f"   2. Commit changes: git add */. claude/settings.json && git commit")
        print(f"   3. Verify skills work across all projects")


if __name__ == "__main__":
    main()
