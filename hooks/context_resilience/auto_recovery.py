"""
Auto Recovery Engine
Compact 후 또는 세션 시작 시 자동으로 컨텍스트 복구

동작 방식:
1. 가장 최근 세션의 Protected Context 로드
2. 활성 스킬 경로 확인
3. 복구 메시지 생성
4. systemMessage로 Claude에게 전달
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
    """자동 복구 엔진"""

    def __init__(self, config: Optional[ContextResilienceConfig] = None):
        self.config = config or get_config()
        self.manager = get_protected_context_manager()
        self.anchor_manager = get_semantic_anchor_manager()

    def find_recent_session(self, current_cwd: str = None, max_age_hours: int = 336) -> Optional[str]:  # 14일 = 336시간
        """
        최근 세션 ID 찾기

        조건:
        1. max_age_hours 이내에 업데이트됨
        2. 같은 작업 디렉토리 우선 (있는 경우)
        3. 의미있는 컨텐츠가 있는 세션만
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

            # 업데이트 시간 확인
            if not context.updated_at:
                continue
            try:
                updated = datetime.fromisoformat(context.updated_at)
                if updated < cutoff:
                    continue
            except ValueError:
                continue

            # 의미있는 컨텐츠가 있는지 확인
            has_meaningful_content = bool(
                context.user_intent or
                context.key_decisions or
                context.pending_tasks or
                context.active_files
            )
            if not has_meaningful_content:
                continue

            # 작업 디렉토리 매칭 여부에 따라 분류
            candidate = (session_id, context, updated)
            if current_cwd and context.working_directory:
                if self._normalize_path(context.working_directory) == self._normalize_path(current_cwd):
                    same_cwd_candidates.append(candidate)
                else:
                    other_candidates.append(candidate)
            else:
                other_candidates.append(candidate)

        # updated_at 기준 내림차순 정렬 (최신 먼저)
        same_cwd_candidates.sort(key=lambda x: x[2], reverse=True)
        other_candidates.sort(key=lambda x: x[2], reverse=True)

        # 같은 CWD 세션 우선, 없으면 다른 세션
        if same_cwd_candidates:
            return same_cwd_candidates[0][0]
        if other_candidates:
            return other_candidates[0][0]
        return None

    def _normalize_path(self, path: str) -> str:
        """경로 정규화"""
        return str(Path(path).resolve()).lower()

    def should_recover(self, session_id: str) -> bool:
        """복구가 필요한지 확인"""
        if not self.config.enabled or not self.config.auto_recover:
            return False

        context = self.manager.load(session_id)
        if not context:
            return False

        # 최소한의 정보가 있어야 복구 의미 있음
        has_meaningful_content = bool(
            context.user_intent or
            context.key_decisions or
            context.pending_tasks or
            context.active_files
        )

        return has_meaningful_content

    def recover(self, session_id: str) -> Dict[str, Any]:
        """
        컨텍스트 복구 실행

        Returns:
            hookSpecificOutput 형식으로 Claude에게 컨텍스트 전달
        """
        if not self.should_recover(session_id):
            return {"continue": True}

        context = self.manager.load(session_id)
        if not context:
            return {"continue": True}

        # 복구 메시지 생성
        message = self.manager.build_recovery_message(context)

        # 앵커 요약 추가
        anchors_summary = self.anchor_manager.build_anchors_summary(session_id, limit=10)
        if anchors_summary:
            message += "\n\n" + anchors_summary

        # 길이 제한
        max_len = self.config.recovery_message_max_length
        if len(message) > max_len:
            message = message[:max_len - 50] + "\n\n... (일부 생략됨)"

        return {
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": message
            }
        }

    def recover_for_cwd(self, cwd: str) -> Dict[str, Any]:
        """
        현재 작업 디렉토리 기반 복구

        SessionStart 훅에서 사용
        """
        session_id = self.find_recent_session(current_cwd=cwd)
        if not session_id:
            return {"continue": True}

        return self.recover(session_id)

    def get_active_skills(self, session_id: str) -> List[str]:
        """활성 스킬 경로 목록 반환"""
        context = self.manager.load(session_id)
        if not context:
            return []
        return context.active_skills

    def detect_skills_in_directory(self, cwd: str) -> List[str]:
        """
        작업 디렉토리에서 스킬 파일 감지

        검색 위치:
        1. ~/.claude/skills/
        2. {cwd}/.claude/skills/
        """
        skills = []

        # 글로벌 스킬
        global_skills_dir = Path("~/.claude/skills").expanduser()
        if global_skills_dir.exists():
            for skill_dir in global_skills_dir.iterdir():
                if skill_dir.is_dir():
                    skill_md = skill_dir / "SKILL.md"
                    if skill_md.exists():
                        skills.append(str(skill_md))

        # 프로젝트 로컬 스킬
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
        새 세션 초기화 + 이전 세션 복구

        SessionStart에서 호출
        """
        # 이전 세션 복구 시도
        recovery_result = self.recover_for_cwd(cwd)

        # 새 세션 초기화
        skills = self.detect_skills_in_directory(cwd)

        self.manager.update(
            session_id,
            working_directory=cwd,
            active_skills=skills,
            claude_md_hash=self.manager.compute_claude_md_hash(cwd)
        )

        return recovery_result


# 편의 함수
def get_auto_recovery_engine() -> AutoRecoveryEngine:
    """AutoRecoveryEngine 인스턴스 반환"""
    return AutoRecoveryEngine()
