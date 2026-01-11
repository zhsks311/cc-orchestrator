"""
Semantic Anchors
중요 결정, 에러 해결 등 중요 순간을 자동 감지하여 저장

앵커 타입:
- DECISION: 결정사항 ("이렇게 하자", "선택")
- ERROR_RESOLVED: 에러 해결 완료
- FILE_MODIFIED: 파일 수정 완료
- USER_EXPLICIT: 사용자 명시적 마킹 ("기억해", "중요:")
- CHECKPOINT: 수동 체크포인트
"""

import json
import re
import hashlib
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, Any, Optional, List
from filelock import FileLock

from .config import get_config, ContextResilienceConfig


class AnchorType(Enum):
    """앵커 타입"""
    DECISION = "decision"
    ERROR_RESOLVED = "error_resolved"
    FILE_MODIFIED = "file_modified"
    USER_EXPLICIT = "user_explicit"
    CHECKPOINT = "checkpoint"


# 앵커 감지 패턴
ANCHOR_PATTERNS: Dict[AnchorType, List[str]] = {
    AnchorType.DECISION: [
        r'결정|선택|이렇게\s*하자|방법으로|approach',
        r'decided|choose|let\'s go with|we\'ll use|going with',
        r'선택했|결정했|확정|최종적으로',
    ],
    AnchorType.ERROR_RESOLVED: [
        r'해결|수정\s*완료|고침|에러.*고침',
        r'fixed|resolved|working now|bug.*fixed|error.*resolved',
        r'문제\s*해결|버그\s*수정|이슈\s*해결',
    ],
    AnchorType.USER_EXPLICIT: [
        r'기억해|중요:|잊지\s*마|remember|important:',
        r'메모:|note:|핵심:|key point:',
        r'꼭\s*기억|반드시\s*기억|never forget',
    ],
}


@dataclass
class SemanticAnchor:
    """시맨틱 앵커 데이터"""
    id: str
    session_id: str
    anchor_type: str  # AnchorType.value
    content: str  # 핵심 내용 (최대 200자)
    context: Dict[str, Any] = field(default_factory=dict)  # 관련 파일, 코드 스니펫
    timestamp: str = ""
    importance: int = 1  # 1-5, 높을수록 중요

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()
        # content 길이 제한
        if len(self.content) > 200:
            self.content = self.content[:197] + "..."


class SemanticAnchorManager:
    """시맨틱 앵커 관리자"""

    STATE_DIR = Path("~/.claude/hooks/state").expanduser()
    MAX_ANCHORS = 50  # 세션당 최대 앵커 수

    def __init__(self, config: Optional[ContextResilienceConfig] = None):
        self.config = config or get_config()
        self.STATE_DIR.mkdir(parents=True, exist_ok=True)

    def _get_anchors_path(self, session_id: str) -> Path:
        """앵커 파일 경로"""
        return self.STATE_DIR / f"{session_id}_anchors.json"

    def _get_lock_path(self, session_id: str) -> Path:
        """락 파일 경로"""
        return self.STATE_DIR / f"{session_id}_anchors.lock"

    def _generate_anchor_id(self, content: str, timestamp: str) -> str:
        """앵커 ID 생성"""
        data = f"{content}{timestamp}"
        return hashlib.md5(data.encode()).hexdigest()[:12]

    def load_anchors(self, session_id: str) -> List[SemanticAnchor]:
        """앵커 목록 로드"""
        path = self._get_anchors_path(session_id)
        if not path.exists():
            return []

        lock = FileLock(self._get_lock_path(session_id))
        try:
            with lock.acquire(timeout=5):
                data = json.loads(path.read_text(encoding='utf-8'))
                return [SemanticAnchor(**item) for item in data]
        except Exception:
            return []

    def save_anchors(self, session_id: str, anchors: List[SemanticAnchor]) -> None:
        """앵커 목록 저장"""
        path = self._get_anchors_path(session_id)
        lock = FileLock(self._get_lock_path(session_id))

        try:
            with lock.acquire(timeout=5):
                data = [asdict(a) for a in anchors]
                path.write_text(
                    json.dumps(data, indent=2, ensure_ascii=False),
                    encoding='utf-8'
                )
        except Exception:
            pass

    def add_anchor(
        self,
        session_id: str,
        anchor_type: AnchorType,
        content: str,
        context: Optional[Dict[str, Any]] = None,
        importance: int = 1
    ) -> SemanticAnchor:
        """새 앵커 추가"""
        anchors = self.load_anchors(session_id)

        # 최대 개수 제한 (LRU)
        max_anchors = self.config.max_anchors or self.MAX_ANCHORS
        if len(anchors) >= max_anchors:
            # 중요도 낮은 것부터 삭제 (importance 낮고 오래된 것)
            anchors.sort(key=lambda a: (a.importance, a.timestamp))
            anchors = anchors[1:]  # 가장 낮은 것 삭제

        timestamp = datetime.now().isoformat()
        anchor = SemanticAnchor(
            id=self._generate_anchor_id(content, timestamp),
            session_id=session_id,
            anchor_type=anchor_type.value,
            content=content,
            context=context or {},
            timestamp=timestamp,
            importance=importance
        )

        anchors.append(anchor)
        self.save_anchors(session_id, anchors)

        return anchor

    def detect_and_add(
        self,
        session_id: str,
        text: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Optional[SemanticAnchor]:
        """텍스트에서 앵커 감지 및 추가"""
        if not self.config.enabled:
            return None

        detected_type = self.detect_anchor_type(text)
        if not detected_type:
            return None

        # 앵커 타입별 설정 확인
        anchor_config = self.config.anchor_detection
        if detected_type == AnchorType.DECISION and not anchor_config.decision:
            return None
        if detected_type == AnchorType.ERROR_RESOLVED and not anchor_config.error_resolved:
            return None
        if detected_type == AnchorType.USER_EXPLICIT and not anchor_config.user_explicit:
            return None

        # 중요도 결정
        importance = self._calculate_importance(detected_type, text)

        # 핵심 내용 추출
        content = self._extract_key_content(text, detected_type)

        return self.add_anchor(
            session_id=session_id,
            anchor_type=detected_type,
            content=content,
            context=context,
            importance=importance
        )

    def detect_anchor_type(self, text: str) -> Optional[AnchorType]:
        """텍스트에서 앵커 타입 감지"""
        for anchor_type, patterns in ANCHOR_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    return anchor_type
        return None

    def _calculate_importance(self, anchor_type: AnchorType, text: str) -> int:
        """앵커 중요도 계산 (1-5)"""
        base_importance = {
            AnchorType.USER_EXPLICIT: 5,  # 사용자 명시적 마킹은 최고 중요도
            AnchorType.CHECKPOINT: 5,
            AnchorType.ERROR_RESOLVED: 4,
            AnchorType.DECISION: 3,
            AnchorType.FILE_MODIFIED: 2,
        }

        importance = base_importance.get(anchor_type, 2)

        # 강조 표현이 있으면 +1
        if re.search(r'중요|critical|important|핵심|반드시', text, re.IGNORECASE):
            importance = min(5, importance + 1)

        return importance

    def _extract_key_content(self, text: str, anchor_type: AnchorType) -> str:
        """핵심 내용 추출"""
        # 첫 문장 또는 첫 100자
        lines = text.strip().split('\n')
        first_line = lines[0] if lines else text

        # 패턴 이후 내용 추출 시도
        for pattern in ANCHOR_PATTERNS.get(anchor_type, []):
            match = re.search(f'{pattern}[:\\s]*(.+)', text, re.IGNORECASE)
            if match:
                content = match.group(1).strip()
                if content:
                    return content[:200]

        return first_line[:200]

    def get_recent_anchors(
        self,
        session_id: str,
        limit: int = 10,
        anchor_types: Optional[List[AnchorType]] = None
    ) -> List[SemanticAnchor]:
        """최근 앵커 조회"""
        anchors = self.load_anchors(session_id)

        # 타입 필터
        if anchor_types:
            type_values = [t.value for t in anchor_types]
            anchors = [a for a in anchors if a.anchor_type in type_values]

        # 최신순 + 중요도순 정렬
        anchors.sort(key=lambda a: (a.importance, a.timestamp), reverse=True)

        return anchors[:limit]

    def add_file_modified_anchor(
        self,
        session_id: str,
        file_path: str,
        change_type: str = "modified"
    ) -> SemanticAnchor:
        """파일 수정 앵커 추가"""
        if not self.config.anchor_detection.file_modified:
            return None

        content = f"[{change_type}] {Path(file_path).name}"
        context = {
            "file_path": file_path,
            "change_type": change_type
        }

        return self.add_anchor(
            session_id=session_id,
            anchor_type=AnchorType.FILE_MODIFIED,
            content=content,
            context=context,
            importance=2
        )

    def add_checkpoint(
        self,
        session_id: str,
        message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> SemanticAnchor:
        """수동 체크포인트 추가"""
        return self.add_anchor(
            session_id=session_id,
            anchor_type=AnchorType.CHECKPOINT,
            content=message,
            context=context or {},
            importance=5
        )

    def build_anchors_summary(self, session_id: str, limit: int = 10) -> str:
        """앵커 요약 메시지 생성"""
        anchors = self.get_recent_anchors(session_id, limit=limit)
        if not anchors:
            return ""

        lines = ["### 주요 이력"]

        type_icons = {
            AnchorType.DECISION.value: "🔷",
            AnchorType.ERROR_RESOLVED.value: "✅",
            AnchorType.FILE_MODIFIED.value: "📝",
            AnchorType.USER_EXPLICIT.value: "⭐",
            AnchorType.CHECKPOINT.value: "📌",
        }

        for anchor in anchors:
            icon = type_icons.get(anchor.anchor_type, "•")
            lines.append(f"{icon} {anchor.content}")

        return "\n".join(lines)

    def list_sessions(self) -> List[str]:
        """앵커가 있는 세션 목록"""
        sessions = set()
        for f in self.STATE_DIR.glob("*_anchors.json"):
            session_id = f.stem.replace("_anchors", "")
            sessions.add(session_id)
        return list(sessions)

    def cleanup_old_anchors(self, max_age_days: int = 7) -> int:
        """오래된 앵커 파일 정리"""
        from datetime import timedelta

        cutoff = datetime.now() - timedelta(days=max_age_days)
        deleted = 0

        for f in self.STATE_DIR.glob("*_anchors.json"):
            try:
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if mtime < cutoff:
                    f.unlink()
                    # 락 파일도 삭제
                    lock_file = f.with_suffix('.lock')
                    if lock_file.exists():
                        lock_file.unlink()
                    deleted += 1
            except Exception:
                pass

        return deleted


# 싱글톤 인스턴스
_anchor_manager: Optional[SemanticAnchorManager] = None


def get_semantic_anchor_manager() -> SemanticAnchorManager:
    """SemanticAnchorManager 싱글톤 인스턴스 반환"""
    global _anchor_manager
    if _anchor_manager is None:
        _anchor_manager = SemanticAnchorManager()
    return _anchor_manager
