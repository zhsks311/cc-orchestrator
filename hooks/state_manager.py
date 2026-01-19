"""
State Management Module - Per-session retry count, debounce, override state management
Uses filelock to prevent race conditions
"""
import json
import os
import time
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

try:
    from filelock import FileLock
except ImportError:
    # Simple fallback if filelock not available
    class FileLock:
        def __init__(self, path): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass


class StateManager:
    def __init__(self, state_dir: str = "~/.claude/hooks/state"):
        self.state_dir = Path(state_dir).expanduser()
        self.state_dir.mkdir(parents=True, exist_ok=True)

    def _get_state_path(self, session_id: str, state_type: str) -> Path:
        return self.state_dir / f"{session_id}_{state_type}.json"

    def _get_lock_path(self, session_id: str, state_type: str) -> Path:
        return self.state_dir / f"{session_id}_{state_type}.lock"

    def _read_state(self, session_id: str, state_type: str) -> Dict[str, Any]:
        path = self._get_state_path(session_id, state_type)
        lock_path = self._get_lock_path(session_id, state_type)

        with FileLock(str(lock_path)):
            if path.exists():
                try:
                    return json.loads(path.read_text())
                except json.JSONDecodeError:
                    return {}
            return {}

    def _write_state(self, session_id: str, state_type: str, data: Dict[str, Any]):
        path = self._get_state_path(session_id, state_type)
        lock_path = self._get_lock_path(session_id, state_type)

        with FileLock(str(lock_path)):
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    # ===== Retry Count Management =====
    def get_retry_count(self, session_id: str, stage: str) -> int:
        state = self._read_state(session_id, "retry")
        return state.get(stage, 0)

    def increment_retry_count(self, session_id: str, stage: str) -> int:
        state = self._read_state(session_id, "retry")
        state[stage] = state.get(stage, 0) + 1
        self._write_state(session_id, "retry", state)
        return state[stage]

    def reset_retry_count(self, session_id: str, stage: str):
        state = self._read_state(session_id, "retry")
        state[stage] = 0
        self._write_state(session_id, "retry", state)

    # ===== Debounce Management =====
    def get_last_call_time(self, session_id: str, stage: str) -> Optional[float]:
        state = self._read_state(session_id, "debounce")
        return state.get(stage)

    def update_last_call_time(self, session_id: str, stage: str):
        state = self._read_state(session_id, "debounce")
        state[stage] = time.time()
        self._write_state(session_id, "debounce", state)

    def should_debounce(self, session_id: str, stage: str, debounce_seconds: float) -> bool:
        """Returns True if called within debounce_seconds (should skip)"""
        last_call = self.get_last_call_time(session_id, stage)
        if last_call is None:
            return False
        return (time.time() - last_call) < debounce_seconds

    # ===== Override Management =====
    def set_override(self, session_id: str, skip_count: int = 1):
        """Skip next N reviews"""
        state = self._read_state(session_id, "override")
        state["skip_count"] = skip_count
        state["set_at"] = datetime.now().isoformat()
        self._write_state(session_id, "override", state)

    def check_and_consume_override(self, session_id: str) -> bool:
        """Returns True if override is set and decrements count"""
        state = self._read_state(session_id, "override")
        skip_count = state.get("skip_count", 0)

        if skip_count > 0:
            state["skip_count"] = skip_count - 1
            self._write_state(session_id, "override", state)
            return True
        return False

    # ===== Todo State Management =====
    def get_todo_state(self, session_id: str) -> Dict[str, Any]:
        """Get current todo state"""
        return self._read_state(session_id, "todo")

    def save_todo_state(self, session_id: str, state: Dict[str, Any]):
        """Save todo state"""
        state["updated_at"] = datetime.now().isoformat()
        self._write_state(session_id, "todo", state)

    # ===== Completion Review Count Management =====
    def get_completion_review_count(self, session_id: str) -> int:
        """Get completion review count (for infinite loop prevention)"""
        state = self._read_state(session_id, "todo")
        return state.get("review_count", 0)

    def increment_completion_review_count(self, session_id: str) -> int:
        """Increment completion review count"""
        state = self._read_state(session_id, "todo")
        state["review_count"] = state.get("review_count", 0) + 1
        state["last_review_at"] = datetime.now().isoformat()
        self._write_state(session_id, "todo", state)
        return state["review_count"]

    def reset_completion_review_count(self, session_id: str):
        """Reset completion review count (on new task start)"""
        state = self._read_state(session_id, "todo")
        state["review_count"] = 0
        self._write_state(session_id, "todo", state)

    # ===== Session Cleanup =====
    def cleanup_session(self, session_id: str):
        """Cleanup state files on session end"""
        for state_type in ["retry", "debounce", "override", "todo"]:
            path = self._get_state_path(session_id, state_type)
            lock_path = self._get_lock_path(session_id, state_type)
            if path.exists():
                path.unlink()
            if lock_path.exists():
                lock_path.unlink()


# Singleton instance
_state_manager: Optional[StateManager] = None

def get_state_manager() -> StateManager:
    global _state_manager
    if _state_manager is None:
        _state_manager = StateManager()
    return _state_manager
