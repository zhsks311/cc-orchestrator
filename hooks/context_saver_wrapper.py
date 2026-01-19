#!/usr/bin/env python3
"""
Context Saver Wrapper
PostToolUse hook that auto-saves context after Edit, Write, TodoWrite

Usage (settings.json):
{
  "PostToolUse": [
    {
      "matcher": "Edit|Write|TodoWrite",
      "hooks": [
        {
          "type": "command",
          "command": "python {{HOOKS_PATH}}/context_saver_wrapper.py"
        }
      ]
    }
  ]
}
"""

import sys
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

HOOKS_DIR = Path(__file__).parent
LOG_FILE = HOOKS_DIR / "logs" / "context-saver.log"

# Lazy import flag
_resilience_imported = False


def log(message: str):
    """Debug log"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def extract_file_path(tool_input: Dict[str, Any]) -> Optional[str]:
    """Extract file path from tool input"""
    return tool_input.get("file_path")


def extract_todos(tool_input: Dict[str, Any]) -> list:
    """Extract todo list from TodoWrite input"""
    return tool_input.get("todos", [])


def detect_decision_keywords(text: str) -> bool:
    """Detect decision-related keywords"""
    patterns = [
        r'decided|choose|let\'s go with|approach',
        r'decided|choose|let\'s go with|approach'
    ]
    for pattern in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def detect_error_resolved(text: str) -> bool:
    """Detect error resolved keywords"""
    patterns = [
        r'fixed|resolved|working now|bug.*fixed',
        r'fixed|resolved|working now|bug.*fixed'
    ]
    for pattern in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def process_edit_write(session_id: str, tool_name: str, tool_input: Dict[str, Any], cwd: str):
    """Process Edit/Write tool"""
    sys.path.insert(0, str(HOOKS_DIR))
    from context_resilience import (
        get_protected_context_manager,
        get_config,
        get_semantic_anchor_manager,
    )

    config = get_config()
    if not config.enabled or not config.auto_save:
        return

    manager = get_protected_context_manager()
    anchor_manager = get_semantic_anchor_manager()

    # Save file path
    file_path = extract_file_path(tool_input)
    if file_path:
        manager.add_active_file(session_id, file_path)
        log(f"Added active file: {file_path}")

        # Semantic Anchor: file modification record
        change_type = "created" if tool_name == "Write" else "modified"
        anchor_manager.add_file_modified_anchor(session_id, file_path, change_type)
        log(f"Added file anchor: {file_path} ({change_type})")

    # Save working directory
    if cwd:
        manager.set_working_directory(session_id, cwd)

    # Update CLAUDE.md hash
    if cwd:
        claude_md_hash = manager.compute_claude_md_hash(cwd)
        if claude_md_hash:
            manager.update(session_id, claude_md_hash=claude_md_hash)


def process_todo_write(session_id: str, tool_input: Dict[str, Any], cwd: str):
    """Process TodoWrite tool"""
    sys.path.insert(0, str(HOOKS_DIR))
    from context_resilience import (
        get_protected_context_manager,
        get_config,
        get_semantic_anchor_manager,
        AnchorType,
    )

    config = get_config()
    if not config.enabled or not config.auto_save:
        return

    manager = get_protected_context_manager()
    anchor_manager = get_semantic_anchor_manager()

    todos = extract_todos(tool_input)
    if not todos:
        return

    # Extract pending tasks
    pending = [
        t.get("content", "")
        for t in todos
        if t.get("status") in ("pending", "in_progress")
    ]
    if pending:
        manager.set_pending_tasks(session_id, pending)
        log(f"Updated pending tasks: {len(pending)} items")

    # Extract decisions/resolved errors from completed tasks
    completed = [
        t.get("content", "")
        for t in todos
        if t.get("status") == "completed"
    ]

    for task in completed:
        # Detect decision keywords
        if detect_decision_keywords(task):
            manager.add_decision(session_id, f"[Completed] {task}")
            anchor_manager.add_anchor(
                session_id,
                AnchorType.DECISION,
                f"[Todo Completed] {task}",
                context={"source": "TodoWrite"},
                importance=3
            )
            log(f"Added decision anchor: {task}")

        # Detect error resolved keywords
        if detect_error_resolved(task):
            manager.add_resolved_error(session_id, task)
            anchor_manager.add_anchor(
                session_id,
                AnchorType.ERROR_RESOLVED,
                f"[Resolved] {task}",
                context={"source": "TodoWrite"},
                importance=4
            )
            log(f"Added error resolved anchor: {task}")

    # Auto checkpoint when all todos completed
    if todos and all(t.get("status") == "completed" for t in todos):
        completed_summary = ", ".join(completed[:3])
        if len(completed) > 3:
            completed_summary += f" and {len(completed) - 3} more"

        anchor_manager.add_checkpoint(
            session_id,
            f"[All Todos Completed] {completed_summary}",
            context={
                "completed_count": len(completed),
                "tasks": completed[:5]  # Max 5 only
            }
        )
        log(f"Added checkpoint: All {len(completed)} todos completed")


def main():
    """Main entrypoint"""
    log("context_saver_wrapper.py executed")

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
        tool_name = hook_input.get("tool_name", "")
        tool_input = hook_input.get("tool_input", {})
        cwd = hook_input.get("cwd", "")

        log(f"Processing tool: {tool_name}, session: {session_id[:8]}...")

        if tool_name in ("Edit", "Write"):
            process_edit_write(session_id, tool_name, tool_input, cwd)
        elif tool_name == "TodoWrite":
            process_todo_write(session_id, tool_input, cwd)

        # Always return continue=True (non-blocking)
        print(json.dumps({"continue": True}))

    except Exception as e:
        log(f"Error processing: {e}")
        print(json.dumps({"continue": True}))


if __name__ == "__main__":
    main()
