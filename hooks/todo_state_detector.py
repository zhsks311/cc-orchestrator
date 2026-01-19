"""
Todo State Detection Module - Detect completion state of TodoWrite
Determine when all todos become completed status
"""
from dataclasses import dataclass
from typing import List, Dict, Any

from state_manager import get_state_manager, StateManager


@dataclass
class TodoState:
    """Todo state info"""
    all_completed: bool  # Whether all todos are completed
    just_completed: bool  # Just completed in this call (was incomplete before)
    total: int  # Total todo count
    completed: int  # Completed todo count


class TodoStateDetector:
    """Todo completion state detector"""

    def __init__(self, state_manager: StateManager = None):
        self.state_manager = state_manager or get_state_manager()

    def detect_completion(self, session_id: str, todos: List[Dict[str, Any]]) -> TodoState:
        """
        Detect todo completion state

        Args:
            session_id: Session ID
            todos: TodoWrite's todos array

        Returns:
            TodoState: Completion state info
        """
        if not todos:
            return TodoState(
                all_completed=False,
                just_completed=False,
                total=0,
                completed=0
            )

        total = len(todos)
        completed = sum(1 for t in todos if t.get("status") == "completed")
        all_completed = completed == total

        # Compare with previous state to detect "just completed"
        prev_state = self.state_manager.get_todo_state(session_id)
        prev_all_completed = prev_state.get("all_completed", False)

        # Previously incomplete -> currently complete = just completed
        just_completed = all_completed and not prev_all_completed

        # Save current state
        self.state_manager.save_todo_state(session_id, {
            "all_completed": all_completed,
            "total": total,
            "completed": completed,
            "todos_snapshot": [
                {"content": t.get("content", ""), "status": t.get("status", "")}
                for t in todos
            ]
        })

        return TodoState(
            all_completed=all_completed,
            just_completed=just_completed,
            total=total,
            completed=completed
        )

    def should_trigger_review(self, session_id: str, todos: List[Dict[str, Any]]) -> bool:
        """
        Determine if completion review should be triggered

        Returns:
            True if all todos just completed
        """
        state = self.detect_completion(session_id, todos)
        return state.just_completed


# Convenience function
def get_todo_state_detector() -> TodoStateDetector:
    return TodoStateDetector()
