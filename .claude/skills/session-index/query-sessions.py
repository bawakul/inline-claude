#!/usr/bin/env python3
"""
Query the session index for past sessions.

Usage:
    python3 query-sessions.py --recent 5
    python3 query-sessions.py --project annotated-reader
    python3 query-sessions.py --search "onlook" "visual editor"
    python3 query-sessions.py --since 2025-12-15 --tags planning
    python3 query-sessions.py --project sync-player --full
"""

import json
import argparse
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

# Portfolio root (script is in .claude/skills/session-index/)
# Path: .claude/skills/session-index/query-sessions.py → parent x4 → portfolio root
PORTFOLIO_ROOT = Path(__file__).parent.parent.parent.parent
INDEX_PATH = PORTFOLIO_ROOT / "_Portfolio" / "session-index.json"


def load_index() -> Dict[str, Any]:
    """Load the session index JSON file."""
    if not INDEX_PATH.exists():
        print(f"⚠️  Session index not found at {INDEX_PATH}")
        print("Run: python3 _Portfolio/scripts/build-session-index.py")
        sys.exit(1)

    try:
        with open(INDEX_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error loading session index: {e}")
        sys.exit(1)


def filter_by_project(sessions: List[Dict], project: str) -> List[Dict]:
    """Filter sessions by project name (case-insensitive partial match)."""
    project_lower = project.lower()
    return [
        s for s in sessions
        if project_lower in s.get('project', '').lower()
    ]


def filter_by_date_range(sessions: List[Dict], since: str = None, until: str = None) -> List[Dict]:
    """Filter sessions by date range (YYYY-MM-DD format)."""
    filtered = sessions

    if since:
        try:
            since_date = datetime.strptime(since, '%Y-%m-%d').date()
            filtered = [
                s for s in filtered
                if datetime.strptime(s.get('date', ''), '%Y-%m-%d').date() >= since_date
            ]
        except ValueError:
            print(f"⚠️  Invalid date format for --since: {since} (use YYYY-MM-DD)")
            sys.exit(1)

    if until:
        try:
            until_date = datetime.strptime(until, '%Y-%m-%d').date()
            filtered = [
                s for s in filtered
                if datetime.strptime(s.get('date', ''), '%Y-%m-%d').date() <= until_date
            ]
        except ValueError:
            print(f"⚠️  Invalid date format for --until: {until} (use YYYY-MM-DD)")
            sys.exit(1)

    return filtered


def filter_by_tags(sessions: List[Dict], tags: List[str]) -> List[Dict]:
    """Filter sessions that have ANY of the specified tags."""
    tags_lower = [t.lower() for t in tags]
    return [
        s for s in sessions
        if any(tag.lower() in tags_lower for tag in s.get('tags', []))
    ]


def search_content(sessions: List[Dict], keywords: List[str]) -> List[Dict]:
    """Search sessions for ALL keywords in title or content (case-insensitive)."""
    keywords_lower = [k.lower() for k in keywords]

    def matches(session):
        searchable = (
            session.get('title', '').lower() + ' ' +
            session.get('content', '').lower()
        )
        return all(keyword in searchable for keyword in keywords_lower)

    return [s for s in sessions if matches(s)]


def format_text_output(sessions: List[Dict], full: bool = False, recent: int = None) -> str:
    """Format sessions as human-readable text."""
    if not sessions:
        return "No sessions found matching your query."

    # Limit to recent N if specified
    display_sessions = sessions[:recent] if recent else sessions

    output = []
    output.append(f"\nFound {len(sessions)} session{'s' if len(sessions) != 1 else ''} matching your query:\n")

    for i, session in enumerate(display_sessions, 1):
        output.append(f"{i}. {session.get('title', 'Untitled')} ({session.get('date', 'No date')})")
        output.append(f"   Project: {session.get('project', 'Unknown')}")
        output.append(f"   Tags: {', '.join(session.get('tags', []))}")

        if full:
            output.append(f"\n   Content:\n   {'-' * 70}")
            # Indent content
            content = session.get('content', 'No content')
            for line in content.split('\n'):
                output.append(f"   {line}")
            output.append(f"   {'-' * 70}")
        else:
            # Show preview (first 150 chars)
            content = session.get('content', 'No content')
            # Strip frontmatter for preview
            if content.startswith('---'):
                parts = content.split('---', 2)
                if len(parts) >= 3:
                    content = parts[2].strip()

            preview = content[:150].replace('\n', ' ')
            if len(content) > 150:
                preview += "..."
            output.append(f"   Preview: {preview}")

        output.append(f"   Path: {session.get('path', 'Unknown')}")
        output.append("")  # Blank line between sessions

    if recent and len(sessions) > recent:
        output.append(f"[{len(sessions) - recent} more session{'s' if len(sessions) - recent != 1 else ''}...]")

    return '\n'.join(output)


def format_json_output(sessions: List[Dict], recent: int = None) -> str:
    """Format sessions as JSON."""
    display_sessions = sessions[:recent] if recent else sessions
    return json.dumps(display_sessions, indent=2)


def show_stats(index_data: Dict) -> str:
    """Show statistics about the session index."""
    sessions = index_data.get('sessions', [])

    # Extract unique projects
    projects = set(s.get('project', 'Unknown') for s in sessions)

    # Extract date range
    dates = [s.get('date', '') for s in sessions if s.get('date')]
    date_range = f"{min(dates)} to {max(dates)}" if dates else "No dates"

    # Count by project
    project_counts = {}
    for s in sessions:
        proj = s.get('project', 'Unknown')
        project_counts[proj] = project_counts.get(proj, 0) + 1

    output = []
    output.append("\n📊 Session Index Statistics")
    output.append(f"\nLast updated: {index_data.get('last_updated', 'Unknown')}")
    output.append(f"Total sessions: {index_data.get('total_sessions', 0)}")
    output.append(f"Date range: {date_range}")
    output.append(f"\nProjects ({len(projects)}):")

    for proj, count in sorted(project_counts.items(), key=lambda x: x[1], reverse=True):
        output.append(f"  - {proj}: {count} session{'s' if count != 1 else ''}")

    return '\n'.join(output)


def rebuild_index() -> None:
    """Rebuild the session index."""
    import subprocess

    script_path = PORTFOLIO_ROOT / "_Portfolio" / "scripts" / "build-session-index.py"

    if not script_path.exists():
        print(f"❌ Build script not found at {script_path}")
        sys.exit(1)

    print("🔄 Rebuilding session index...")
    try:
        result = subprocess.run(
            ['python3', str(script_path)],
            cwd=PORTFOLIO_ROOT,
            capture_output=True,
            text=True
        )
        print(result.stdout)
        if result.returncode != 0:
            print(result.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"❌ Error rebuilding index: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description='Query the session index for past sessions',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --recent 5
  %(prog)s --project annotated-reader
  %(prog)s --search "onlook" "visual editor"
  %(prog)s --since 2025-12-15 --tags planning
  %(prog)s --project sync-player --full
  %(prog)s --stats
        """
    )

    # Filters
    parser.add_argument('--project', help='Filter by project name (partial match)')
    parser.add_argument('--since', help='Sessions on or after date (YYYY-MM-DD)')
    parser.add_argument('--until', help='Sessions on or before date (YYYY-MM-DD)')
    parser.add_argument('--tags', nargs='+', help='Filter by tags (matches ANY)')
    parser.add_argument('--search', nargs='+', help='Search keywords (matches ALL)')

    # Display
    parser.add_argument('--recent', type=int, help='Return only N most recent sessions')
    parser.add_argument('--full', action='store_true', help='Include full content')
    parser.add_argument('--format', choices=['text', 'json'], default='text', help='Output format')

    # Special
    parser.add_argument('--stats', action='store_true', help='Show index statistics')
    parser.add_argument('--rebuild', action='store_true', help='Rebuild the index')

    args = parser.parse_args()

    # Handle special commands
    if args.rebuild:
        rebuild_index()
        return

    # Load index
    index_data = load_index()

    if args.stats:
        print(show_stats(index_data))
        return

    # Start with all sessions
    sessions = index_data.get('sessions', [])

    # Apply filters
    if args.project:
        sessions = filter_by_project(sessions, args.project)

    if args.since or args.until:
        sessions = filter_by_date_range(sessions, args.since, args.until)

    if args.tags:
        sessions = filter_by_tags(sessions, args.tags)

    if args.search:
        sessions = search_content(sessions, args.search)

    # Output results
    if args.format == 'json':
        print(format_json_output(sessions, args.recent))
    else:
        print(format_text_output(sessions, args.full, args.recent))


if __name__ == '__main__':
    main()
