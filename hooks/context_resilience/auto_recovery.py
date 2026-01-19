"""
Auto Recovery Engine
Automatically recover context after compact or session start

How it works:
1. Load Protected Context from the most recent session
2. Check active skill paths
3. Generate recovery message
4. Deliver to Claude via systemMessage
"""

import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, List

from .protected_context import (
    ProtectedContext,
    ProtectedContextManager,
    get_protected_context_manager,
)
from .semantic_anchors import (
    SemanticAnchorManager,
    get_semantic_anchor_manager,
)
from .config import get_config, ContextResilienceConfig


class AutoRecoveryEngine:
    """Auto recovery engine"""

    def __init__(self, config: Optional[ContextResilienceConfig] = None):
        self.config = config or get_config()
        self.manager = get_protected_context_manager()
        self.anchor_manager = get_semantic_anchor_manager()

    def find_recent_session(self, current_cwd: str = None, max_age_hours: int = 336) -> Optional[str]:  # 14 days = 336 hours
        """
        Find recent session ID

        Conditions:
        1. Updated within max_age_hours
        2. Prefer same working directory (if available)
        3. Only sessions with meaningful content
        """
        sessions = self.manager.list_sessions()
        if not sessions:
            return None

        cutoff = datetime.now() - timedelta(hours=max_age_hours)
        same_cwd_candidates = []
        other_candidates = []

        for session_id in sessions:
            context = self.manager.load(session_id)
            if not context:
                continue

            # Check update time
            if not context.updated_at:
                continue
            try:
                updated = datetime.fromisoformat(context.updated_at)
                if updated < cutoff:
                    continue
            except ValueError:
                continue

            # Check if there's meaningful content
            has_meaningful_content = bool(
                context.user_intent or
                context.key_decisions or
                context.pending_tasks or
                context.active_files
            )
            if not has_meaningful_content:
                continue

            # Classify based on working directory match
            candidate = (session_id, context, updated)
            if current_cwd and context.working_directory:
                if self._normalize_path(context.working_directory) == self._normalize_path(current_cwd):
                    same_cwd_candidates.append(candidate)
                else:
                    other_candidates.append(candidate)
            else:
                other_candidates.append(candidate)

        # Sort by updated_at descending (newest first)
        same_cwd_candidates.sort(key=lambda x: x[2], reverse=True)
        other_candidates.sort(key=lambda x: x[2], reverse=True)

        # Prefer same CWD session, otherwise other sessions
        if same_cwd_candidates:
            return same_cwd_candidates[0][0]
        if other_candidates:
            return other_candidates[0][0]
        return None

    def _normalize_path(self, path: str) -> str:
        """Normalize path"""
        return str(Path(path).resolve()).lower()

    def should_recover(self, session_id: str) -> bool:
        """Check if recovery is needed"""
        if not self.config.enabled or not self.config.auto_recover:
            return False

        context = self.manager.load(session_id)
        if not context:
            return False

        # Recovery only meaningful if there's minimal info
        has_meaningful_content = bool(
            context.user_intent or
            context.key_decisions or
            context.pending_tasks or
            context.active_files
        )

        return has_meaningful_content

    def recover(self, session_id: str) -> Dict[str, Any]:
        """
        Execute context recovery

        Returns:
            Deliver context to Claude in hookSpecificOutput format
        """
        if not self.should_recover(session_id):
            return {"continue": True}

        context = self.manager.load(session_id)
        if not context:
            return {"continue": True}

        # Generate recovery message
        message = self.manager.build_recovery_message(context)

        # Add anchor summary
        anchors_summary = self.anchor_manager.build_anchors_summary(session_id, limit=10)
        if anchors_summary:
            message += "\n\n" + anchors_summary

        # Length limit
        max_len = self.config.recovery_message_max_length
        if len(message) > max_len:
            message = message[:max_len - 50] + "\n\n... (partially omitted)"

        return {
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": message
            }
        }

    def recover_for_cwd(self, cwd: str) -> Dict[str, Any]:
        """
        Recover based on current working directory

        Used in SessionStart hook
        """
        session_id = self.find_recent_session(current_cwd=cwd)
        if not session_id:
            return {"continue": True}

        return self.recover(session_id)

    def get_active_skills(self, session_id: str) -> List[str]:
        """Return list of active skill paths"""
        context = self.manager.load(session_id)
        if not context:
            return []
        return context.active_skills

    def detect_skills_in_directory(self, cwd: str) -> List[str]:
        """
        Detect skill files in working directory

        Search locations:
        1. ~/.claude/skills/
        2. {cwd}/.claude/skills/
        """
        skills = []

        # Global skills
        global_skills_dir = Path("~/.claude/skills").expanduser()
        if global_skills_dir.exists():
            for skill_dir in global_skills_dir.iterdir():
                if skill_dir.is_dir():
                    skill_md = skill_dir / "SKILL.md"
                    if skill_md.exists():
                        skills.append(str(skill_md))

        # Project local skills
        if cwd:
            local_skills_dir = Path(cwd) / ".claude" / "skills"
            if local_skills_dir.exists():
                for skill_dir in local_skills_dir.iterdir():
                    if skill_dir.is_dir():
                        skill_md = skill_dir / "SKILL.md"
                        if skill_md.exists():
                            skills.append(str(skill_md))

        return skills

    def initialize_session(self, session_id: str, cwd: str) -> Dict[str, Any]:
        """
        Initialize new session + recover previous session

        Called from SessionStart
        """
        # Attempt previous session recovery
        recovery_result = self.recover_for_cwd(cwd)

        # Initialize new session
        skills = self.detect_skills_in_directory(cwd)

        self.manager.update(
            session_id,
            working_directory=cwd,
            active_skills=skills,
            claude_md_hash=self.manager.compute_claude_md_hash(cwd)
        )

        return recovery_result


# Convenience function
def get_auto_recovery_engine() -> AutoRecoveryEngine:
    """Return AutoRecoveryEngine instance"""
    return AutoRecoveryEngine()
