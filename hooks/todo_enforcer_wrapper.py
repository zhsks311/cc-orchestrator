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
CONFIG_FILE = HOOKS_DIR / "config.json"


def log(message: str):
    """Debug logging"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def load_config() -> Dict[str, Any]:
    """Load todo_enforcer config from hooks/config.json"""
    default_config = {
        "enabled": True,
        "warn_on_incomplete": True,
        "save_incomplete_state": True,
        "recover_on_session_start": True
    }
    try:
        if CONFIG_FILE.exists():
            config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            todo_config = config.get("todo_enforcer", {})
            return {**default_config, **todo_config}
    except Exception as e:
        log(f"Config load error: {e}")
    return default_config


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


def main():
    """Main entrypoint for PreCompact hook"""
    log("todo_enforcer_wrapper.py executed")

    # Load config
    config = load_config()
    if not config.get("enabled", True):
        log("Todo enforcer is disabled in config")
        print(json.dumps({"continue": True}))
        return

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
        # Import TodoEnforcer here to avoid circular imports
        from todo_enforcer import get_todo_enforcer

        session_id = hook_input.get("session_id", "unknown")
        hook_event = hook_input.get("hook_event_name", "PreCompact")
        transcript = hook_input.get("transcript", [])

        log(f"Processing {hook_event} for session {session_id[:16]}...")

        # Extract todos from transcript
        todos = extract_todos_from_transcript(transcript)
        log(f"Found {len(todos)} todos in transcript")

        if not todos:
            print(json.dumps({"continue": True}))
            return

        # Use TodoEnforcer for analysis (avoid code duplication)
        enforcer = get_todo_enforcer()
        save_state = config.get("save_incomplete_state", True)
        report = enforcer.analyze_todos(session_id, todos, save_state=save_state)

        # Output result
        result = {"continue": True}

        if report.has_incomplete and config.get("warn_on_incomplete", True):
            # Include warning in hook-specific output
            result["hookSpecificOutput"] = report.warning_message
            log(f"Injected warning: {report.pending_count} pending, {report.in_progress_count} in_progress")

        print(json.dumps(result))

    except Exception as e:
        log(f"Error processing: {e}")
        import traceback
        log(traceback.format_exc())
        print(json.dumps({"continue": True}))


if __name__ == "__main__":
    main()
