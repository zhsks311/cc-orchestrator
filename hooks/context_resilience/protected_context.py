"""
Protected Context Manager
Compact 시에도 손실되면 안 되는 핵심 정보를 관리

저장 위치: ~/.claude/hooks/state/{session_id}_protected.json
"""

import json
import hashlib
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

try:
    from filelock import FileLock
except ImportError:
    class FileLock:
        def __init__(self, path): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass


@dataclass
class ProtectedContext:
    """보호되어야 할 컨텍스트 정보"""

    # 시스템 레벨 (필수)
    session_id: str = ""
    working_directory: str = ""
    active_skills: List[str] = field(default_factory=list)
    claude_md_hash: str = ""

    # 세션 레벨 (중요)
    user_intent: str = ""
    key_decisions: List[str] = field(default_factory=list)
    active_files: List[str] = field(default_factory=list)
    resolved_errors: List[str] = field(default_factory=list)
    pending_tasks: List[str] = field(default_factory=list)

    # 메타데이터
    created_at: str = ""
    updated_at: str = ""
    version: int = 1

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ProtectedContext':
        # 알려진 필드만 추출
        known_fields = {
            'session_id', 'working_directory', 'active_skills', 'claude_md_hash',
            'user_intent', 'key_decisions', 'active_files', 'resolved_errors',
            'pending_tasks', 'created_at', 'updated_at', 'version'
        }
        filtered = {k: v for k, v in data.items() if k in known_fields}
        return cls(**filtered)


class ProtectedContextManager:
    """Protected Context 저장/로드 관리"""

    MAX_DECISIONS = 20
    MAX_FILES = 30
    MAX_ERRORS = 10
    MAX_TASKS = 20
    MAX_CONTENT_LENGTH = 200  # 각 항목 최대 길이

    def __init__(self, state_dir: str = "~/.claude/hooks/state"):
        self.state_dir = Path(state_dir).expanduser()
        self.state_dir.mkdir(parents=True, exist_ok=True)

    def _get_context_path(self, session_id: str) -> Path:
        return self.state_dir / f"{session_id}_protected.json"

    def _get_lock_path(self, session_id: str) -> Path:
        return self.state_dir / f"{session_id}_protected.lock"

    def _truncate(self, text: str, max_len: int = None) -> str:
        """텍스트 길이 제한"""
        max_len = max_len or self.MAX_CONTENT_LENGTH
        if len(text) > max_len:
            return text[:max_len - 3] + "..."
        return text

    def _truncate_list(self, items: List[str], max_items: int) -> List[str]:
        """리스트 길이 제한 (최신 항목 유지)"""
        truncated = [self._truncate(item) for item in items]
        if len(truncated) > max_items:
            return truncated[-max_items:]  # 최신 항목 유지
        return truncated

    def load(self, session_id: str) -> Optional[ProtectedContext]:
        """Protected Context 로드"""
        path = self._get_context_path(session_id)
        lock_path = self._get_lock_path(session_id)

        with FileLock(str(lock_path)):
            if not path.exists():
                return None
            try:
                data = json.loads(path.read_text(encoding='utf-8'))
                return ProtectedContext.from_dict(data)
            except (json.JSONDecodeError, KeyError, UnicodeDecodeError) as e:
                return None

    def save(self, context: ProtectedContext) -> None:
        """Protected Context 저장"""
        if not context.session_id:
            raise ValueError("session_id is required")

        path = self._get_context_path(context.session_id)
        lock_path = self._get_lock_path(context.session_id)

        # 타임스탬프 업데이트
        now = datetime.now().isoformat()
        if not context.created_at:
            context.created_at = now
        context.updated_at = now

        # 리스트 크기 제한
        context.key_decisions = self._truncate_list(
            context.key_decisions, self.MAX_DECISIONS
        )
        context.active_files = self._truncate_list(
            context.active_files, self.MAX_FILES
        )
        context.resolved_errors = self._truncate_list(
            context.resolved_errors, self.MAX_ERRORS
        )
        context.pending_tasks = self._truncate_list(
            context.pending_tasks, self.MAX_TASKS
        )

        with FileLock(str(lock_path)):
            path.write_text(
                json.dumps(context.to_dict(), indent=2, ensure_ascii=False),
                encoding='utf-8'
            )

    def update(self, session_id: str, **updates) -> ProtectedContext:
        """기존 컨텍스트 업데이트 (없으면 새로 생성)"""
        context = self.load(session_id) or ProtectedContext(session_id=session_id)

        for key, value in updates.items():
            if hasattr(context, key):
                current = getattr(context, key)

                # 리스트 필드는 append
                if isinstance(current, list) and not isinstance(value, list):
                    if value and value not in current:
                        current.append(value)
                elif isinstance(current, list) and isinstance(value, list):
                    # 새 항목만 추가
                    for item in value:
                        if item and item not in current:
                            current.append(item)
                else:
                    setattr(context, key, value)

        context.version += 1
        self.save(context)
        return context

    def add_decision(self, session_id: str, decision: str) -> None:
        """핵심 결정사항 추가"""
        self.update(session_id, key_decisions=decision)

    def add_active_file(self, session_id: str, file_path: str) -> None:
        """작업 중인 파일 추가"""
        self.update(session_id, active_files=file_path)

    def add_resolved_error(self, session_id: str, error: str) -> None:
        """해결한 에러 추가"""
        self.update(session_id, resolved_errors=error)

    def set_user_intent(self, session_id: str, intent: str) -> None:
        """사용자 의도 설정"""
        self.update(session_id, user_intent=self._truncate(intent, 500))

    def set_pending_tasks(self, session_id: str, tasks: List[str]) -> None:
        """미완료 작업 설정"""
        self.update(session_id, pending_tasks=tasks)

    def set_working_directory(self, session_id: str, cwd: str) -> None:
        """작업 디렉토리 설정"""
        self.update(session_id, working_directory=cwd)

    def set_active_skills(self, session_id: str, skills: List[str]) -> None:
        """활성 스킬 설정"""
        self.update(session_id, active_skills=skills)

    def compute_claude_md_hash(self, cwd: str) -> str:
        """CLAUDE.md 파일 해시 계산"""
        claude_md_path = Path(cwd) / "CLAUDE.md"
        if claude_md_path.exists():
            content = claude_md_path.read_text(encoding='utf-8')
            return hashlib.md5(content.encode()).hexdigest()[:8]
        return ""

    def delete(self, session_id: str) -> None:
        """컨텍스트 삭제"""
        path = self._get_context_path(session_id)
        lock_path = self._get_lock_path(session_id)

        if path.exists():
            path.unlink()
        if lock_path.exists():
            lock_path.unlink()

    def list_sessions(self) -> List[str]:
        """저장된 세션 ID 목록"""
        sessions = []
        for f in self.state_dir.glob("*_protected.json"):
            session_id = f.stem.replace("_protected", "")
            sessions.append(session_id)
        return sessions

    def build_recovery_message(self, context: ProtectedContext) -> str:
        """복구 메시지 생성"""
        parts = ["## 🔄 컨텍스트 복구됨\n"]

        if context.user_intent:
            parts.append(f"### 작업 목적\n{context.user_intent}\n")

        if context.working_directory:
            parts.append(f"### 작업 디렉토리\n`{context.working_directory}`\n")

        if context.active_skills:
            skills_list = "\n".join(f"- `{s}`" for s in context.active_skills)
            parts.append(f"### 활성 스킬\n{skills_list}\n")

        if context.key_decisions:
            decisions_list = "\n".join(f"- {d}" for d in context.key_decisions[-5:])
            parts.append(f"### 핵심 결정사항 (최근 5개)\n{decisions_list}\n")

        if context.resolved_errors:
            errors_list = "\n".join(f"- {e}" for e in context.resolved_errors[-3:])
            parts.append(f"### 해결한 에러 (최근 3개)\n{errors_list}\n")

        if context.pending_tasks:
            tasks_list = "\n".join(f"- {t}" for t in context.pending_tasks)
            parts.append(f"### 다음 할 일\n{tasks_list}\n")

        if context.active_files:
            files_list = "\n".join(f"- `{f}`" for f in context.active_files[-10:])
            parts.append(f"### 작업 중인 파일 (최근 10개)\n{files_list}\n")

        parts.append("---\n⚠️ 파일 내용은 다시 읽어야 합니다.")

        return "\n".join(parts)


# 싱글톤 인스턴스
_manager: Optional[ProtectedContextManager] = None


def get_protected_context_manager() -> ProtectedContextManager:
    """싱글톤 인스턴스 반환"""
    global _manager
    if _manager is None:
        _manager = ProtectedContextManager()
    return _manager
