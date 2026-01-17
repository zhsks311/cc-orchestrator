#!/usr/bin/env python3
"""
Todo Enforcer Wrapper
PreCompact hook to warn about incomplete tasks

When Claude Code triggers /compact or auto-compact:
1. Check for incomplete todos in the conversation
2. If found, inject a warning reminder into the hook output
3. The warning encourages Claude to continue working

This is inspired by oh-my-opencode's "Sisyphus" - the agent that never gives up.
"""

import sys
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

# ============================================================================
# Constants
# ============================================================================
HOOKS_DIR = Path(__file__).parent
LOG_FILE = HOOKS_DIR / "logs" / "todo-enforcer.log"


def log(message: str):
    """Debug logging"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def extract_todos_from_transcript(transcript: List[Dict]) -> List[Dict[str, Any]]:
    """
    Extract the most recent todo list from the conversation transcript.

    Looks for TodoWrite tool calls in assistant messages.
    Returns the most recent todo list found.
    """
    latest_todos = []

    for entry in reversed(transcript):
        if entry.get("type") != "assistant":
            continue

        content = entry.get("content", [])
        if not isinstance(content, list):
            continue

        for block in content:
            if not isinstance(block, dict):
                continue

            # Check for tool_use blocks (TodoWrite)
            if block.get("type") == "tool_use" and block.get("name") == "TodoWrite":
                tool_input = block.get("input", {})
                todos = tool_input.get("todos", [])
                if todos:
                    return todos  # Return most recent

            # Also check text content for todo patterns (fallback)
            if block.get("type") == "text":
                text = block.get("text", "")
                # Look for markdown todo patterns
                todos = extract_todos_from_text(text)
                if todos and not latest_todos:
                    latest_todos = todos

    return latest_todos


def extract_todos_from_text(text: str) -> List[Dict[str, Any]]:
    """
    Extract todos from markdown-style text.

    Patterns:
    - [ ] Task (pending)
    - [x] Task (completed)
    - [~] Task (in_progress) - less common
    """
    todos = []

    # Match checkbox patterns
    pattern = r'[-*]\s*\[([ xX~])\]\s*(.+?)(?:\n|$)'
    matches = re.findall(pattern, text)

    for checkbox, content in matches:
        checkbox = checkbox.lower().strip()
        if checkbox == 'x':
            status = "completed"
        elif checkbox == '~':
            status = "in_progress"
        else:
            status = "pending"

        todos.append({
            "content": content.strip(),
            "status": status
        })

    return todos


def analyze_todos(todos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze todos and generate report
    """
    if not todos:
        return {
            "has_incomplete": False,
            "message": None
        }

    pending = [t for t in todos if t.get("status") == "pending"]
    in_progress = [t for t in todos if t.get("status") == "in_progress"]
    completed = [t for t in todos if t.get("status") == "completed"]

    has_incomplete = len(pending) > 0 or len(in_progress) > 0

    if not has_incomplete:
        return {
            "has_incomplete": False,
            "message": None
        }

    # Generate warning message
    lines = [
        "",
        "=" * 60,
        "INCOMPLETE TASKS WARNING",
        "=" * 60,
        "",
        f"Progress: {len(completed)}/{len(todos)} tasks completed",
        "",
    ]

    if in_progress:
        lines.append("IN PROGRESS:")
        for t in in_progress[:3]:
            lines.append(f"  > {t.get('content', 'Unknown')}")
        if len(in_progress) > 3:
            lines.append(f"  ... and {len(in_progress) - 3} more")
        lines.append("")

    if pending:
        lines.append("PENDING:")
        for t in pending[:3]:
            lines.append(f"  - {t.get('content', 'Unknown')}")
        if len(pending) > 3:
            lines.append(f"  ... and {len(pending) - 3} more")
        lines.append("")

    lines.extend([
        "ACTION: Continue working on incomplete tasks.",
        "Use TodoWrite to update progress.",
        "=" * 60,
        "",
    ])

    return {
        "has_incomplete": True,
        "pending_count": len(pending),
        "in_progress_count": len(in_progress),
        "completed_count": len(completed),
        "total_count": len(todos),
        "message": "\n".join(lines)
    }


def save_incomplete_state(session_id: str, todos: List[Dict[str, Any]]):
    """Save incomplete tasks for session recovery"""
    pending = [t.get("content", "") for t in todos if t.get("status") == "pending"]
    in_progress = [t.get("content", "") for t in todos if t.get("status") == "in_progress"]

    if not pending and not in_progress:
        return

    state_file = HOOKS_DIR / "state" / f"incomplete_{session_id[:8]}.json"
    state_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        state = {
            "session_id": session_id,
            "pending_tasks": pending,
            "in_progress_tasks": in_progress,
            "saved_at": datetime.now().isoformat()
        }
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        log(f"Saved incomplete state: {len(pending)} pending, {len(in_progress)} in_progress")
    except Exception as e:
        log(f"Failed to save incomplete state: {e}")


def main():
    """Main entrypoint for PreCompact hook"""
    log("todo_enforcer_wrapper.py executed")

    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"continue": True}))
            return

        hook_input = json.loads(input_data)
    except Exception as e:
        log(f"Error reading input: {e}")
        print(json.dumps({"continue": True}))
        return

    try:
        session_id = hook_input.get("session_id", "unknown")
        hook_event = hook_input.get("hook_event_name", "PreCompact")
        transcript = hook_input.get("transcript", [])

        log(f"Processing {hook_event} for session {session_id[:8]}...")

        # Extract todos from transcript
        todos = extract_todos_from_transcript(transcript)
        log(f"Found {len(todos)} todos in transcript")

        if not todos:
            print(json.dumps({"continue": True}))
            return

        # Analyze todos
        analysis = analyze_todos(todos)

        # Save incomplete state for recovery
        if analysis.get("has_incomplete"):
            save_incomplete_state(session_id, todos)

        # Output result
        result = {"continue": True}

        if analysis.get("message"):
            # Include warning in hook-specific output
            result["hookSpecificOutput"] = analysis["message"]
            log(f"Injected warning: {analysis.get('pending_count', 0)} pending, {analysis.get('in_progress_count', 0)} in_progress")

        print(json.dumps(result))

    except Exception as e:
        log(f"Error processing: {e}")
        import traceback
        log(traceback.format_exc())
        print(json.dumps({"continue": True}))


if __name__ == "__main__":
    main()
