"""
Todo Continuation Enforcer
Inspired by oh-my-opencode's "Sisyphus" - forces completion of incomplete tasks

Core principle: If there are incomplete todos, the agent should NOT stop working.
"""
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from pathlib import Path
import json
import sys
import hashlib


def _log_error(message: str) -> None:
    """Log error to stderr (non-blocking)"""
    try:
        print(f"[TodoEnforcer] {message}", file=sys.stderr)
    except Exception:
        pass


def _get_session_hash(session_id: str) -> str:
    """Generate filesystem-safe hash from session_id to avoid collisions.

    Uses SHA256 and takes first 16 chars for sufficient uniqueness
    while keeping filenames reasonable.
    """
    return hashlib.sha256(session_id.encode()).hexdigest()[:16]


@dataclass
class IncompleteTasksReport:
    """Report of incomplete tasks"""
    has_incomplete: bool
    pending_count: int
    in_progress_count: int
    completed_count: int
    total_count: int
    pending_tasks: List[str]
    in_progress_tasks: List[str]
    warning_message: Optional[str]
    should_block_compact: bool


class TodoEnforcer:
    """
    Todo Continuation Enforcer

    Ensures that:
    1. PreCompact doesn't lose track of incomplete tasks
    2. Agent is reminded to continue working on pending items
    3. Session summary includes unfinished work
    """

    # Configurable thresholds
    BLOCK_COMPACT_THRESHOLD = 0  # Block compact if any incomplete tasks
    WARNING_THRESHOLD = 0  # Warn if any incomplete tasks

    def __init__(self):
        pass

    def analyze_todos(self, session_id: str, todos: List[Dict[str, Any]]) -> IncompleteTasksReport:
        """
        Analyze todo list for incomplete tasks

        Args:
            session_id: Session identifier
            todos: List of todo items with 'content' and 'status' keys

        Returns:
            IncompleteTasksReport with analysis results
        """
        if not todos:
            return IncompleteTasksReport(
                has_incomplete=False,
                pending_count=0,
                in_progress_count=0,
                completed_count=0,
                total_count=0,
                pending_tasks=[],
                in_progress_tasks=[],
                warning_message=None,
                should_block_compact=False
            )

        pending_tasks = []
        in_progress_tasks = []
        completed_count = 0

        for todo in todos:
            status = todo.get("status", "pending")
            content = todo.get("content", "Unknown task")

            if status == "pending":
                pending_tasks.append(content)
            elif status == "in_progress":
                in_progress_tasks.append(content)
            elif status == "completed":
                completed_count += 1

        total_count = len(todos)
        incomplete_count = len(pending_tasks) + len(in_progress_tasks)
        has_incomplete = incomplete_count > 0

        # Generate warning message
        warning_message = None
        if has_incomplete:
            warning_message = self._generate_warning(
                pending_tasks, in_progress_tasks, completed_count, total_count
            )

        # Determine if compact should be blocked
        should_block = incomplete_count > self.BLOCK_COMPACT_THRESHOLD

        # Save state for recovery
        self._save_incomplete_state(session_id, pending_tasks, in_progress_tasks)

        return IncompleteTasksReport(
            has_incomplete=has_incomplete,
            pending_count=len(pending_tasks),
            in_progress_count=len(in_progress_tasks),
            completed_count=completed_count,
            total_count=total_count,
            pending_tasks=pending_tasks,
            in_progress_tasks=in_progress_tasks,
            warning_message=warning_message,
            should_block_compact=should_block
        )

    def _generate_warning(
        self,
        pending: List[str],
        in_progress: List[str],
        completed: int,
        total: int
    ) -> str:
        """Generate warning message for incomplete tasks"""
        lines = [
            "## INCOMPLETE TASKS DETECTED",
            "",
            f"Progress: {completed}/{total} tasks completed",
            ""
        ]

        if in_progress:
            lines.append("### Currently In Progress:")
            for task in in_progress[:5]:  # Limit to 5
                lines.append(f"- [ ] {task}")
            if len(in_progress) > 5:
                lines.append(f"  ... and {len(in_progress) - 5} more")
            lines.append("")

        if pending:
            lines.append("### Pending Tasks:")
            for task in pending[:5]:  # Limit to 5
                lines.append(f"- [ ] {task}")
            if len(pending) > 5:
                lines.append(f"  ... and {len(pending) - 5} more")
            lines.append("")

        lines.extend([
            "---",
            "**ACTION REQUIRED**: Please complete the remaining tasks before stopping.",
            "Use TodoWrite to mark tasks as completed when done.",
        ])

        return "\n".join(lines)

    def _save_incomplete_state(
        self,
        session_id: str,
        pending: List[str],
        in_progress: List[str]
    ):
        """Save incomplete task state for recovery"""
        session_hash = _get_session_hash(session_id)
        state_file = Path(__file__).parent / "state" / f"incomplete_{session_hash}.json"
        state_file.parent.mkdir(parents=True, exist_ok=True)

        try:
            state = {
                "session_id": session_id,
                "session_hash": session_hash,
                "pending_tasks": pending,
                "in_progress_tasks": in_progress,
                "total_incomplete": len(pending) + len(in_progress)
            }
            with open(state_file, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            _log_error(f"Failed to save incomplete state: {e}")

    def get_recovery_prompt(self, session_id: str) -> Optional[str]:
        """
        Get recovery prompt for incomplete tasks from previous session
        Used by SessionStart hook to restore context
        """
        session_hash = _get_session_hash(session_id)
        state_file = Path(__file__).parent / "state" / f"incomplete_{session_hash}.json"

        if not state_file.exists():
            return None

        try:
            with open(state_file, "r", encoding="utf-8") as f:
                state = json.load(f)

            pending = state.get("pending_tasks", [])
            in_progress = state.get("in_progress_tasks", [])

            if not pending and not in_progress:
                return None

            lines = [
                "## Previous Session - Incomplete Tasks",
                "",
                "The following tasks were not completed in the previous session:",
                ""
            ]

            if in_progress:
                lines.append("### Was In Progress:")
                for task in in_progress:
                    lines.append(f"- {task}")
                lines.append("")

            if pending:
                lines.append("### Was Pending:")
                for task in pending:
                    lines.append(f"- {task}")
                lines.append("")

            lines.append("Consider continuing these tasks if still relevant.")

            return "\n".join(lines)

        except Exception as e:
            _log_error(f"Failed to get recovery prompt: {e}")
            return None

    def clear_incomplete_state(self, session_id: str):
        """Clear incomplete state after all tasks are completed"""
        session_hash = _get_session_hash(session_id)
        state_file = Path(__file__).parent / "state" / f"incomplete_{session_hash}.json"
        try:
            if state_file.exists():
                state_file.unlink()
        except Exception as e:
            _log_error(f"Failed to clear incomplete state: {e}")


# Singleton instance
_enforcer_instance: Optional[TodoEnforcer] = None


def get_todo_enforcer() -> TodoEnforcer:
    """Get singleton TodoEnforcer instance"""
    global _enforcer_instance
    if _enforcer_instance is None:
        _enforcer_instance = TodoEnforcer()
    return _enforcer_instance
