"""
Semantic Anchors
Automatically detect and save important moments like decisions, error resolutions

Anchor types:
- DECISION: Decisions made ("let's do this", "chose")
- ERROR_RESOLVED: Error resolution completed
- FILE_MODIFIED: File modification completed
- USER_EXPLICIT: User explicit marking ("remember", "important:")
- CHECKPOINT: Manual checkpoint
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
    """Anchor type"""
    DECISION = "decision"
    ERROR_RESOLVED = "error_resolved"
    FILE_MODIFIED = "file_modified"
    USER_EXPLICIT = "user_explicit"
    CHECKPOINT = "checkpoint"


# Anchor detection patterns
ANCHOR_PATTERNS: Dict[AnchorType, List[str]] = {
    AnchorType.DECISION: [
        r'decided|choose|let\'s go with|we\'ll use|going with',
        r'approach|decision|selected|determined',
    ],
    AnchorType.ERROR_RESOLVED: [
        r'fixed|resolved|working now|bug.*fixed|error.*resolved',
        r'problem\s*solved|issue\s*resolved',
    ],
    AnchorType.USER_EXPLICIT: [
        r'remember|important:|note:|key point:',
        r'never forget|must remember',
    ],
}


@dataclass
class SemanticAnchor:
    """Semantic anchor data"""
    id: str
    session_id: str
    anchor_type: str  # AnchorType.value
    content: str  # Core content (max 200 chars)
    context: Dict[str, Any] = field(default_factory=dict)  # Related files, code snippets
    timestamp: str = ""
    importance: int = 1  # 1-5, higher = more important

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()
        # Limit content length
        if len(self.content) > 200:
            self.content = self.content[:197] + "..."


class SemanticAnchorManager:
    """Semantic anchor manager"""

    STATE_DIR = Path("~/.claude/hooks/state").expanduser()
    MAX_ANCHORS = 50  # Max anchors per session

    def __init__(self, config: Optional[ContextResilienceConfig] = None):
        self.config = config or get_config()
        self.STATE_DIR.mkdir(parents=True, exist_ok=True)

    def _get_anchors_path(self, session_id: str) -> Path:
        """Anchor file path"""
        return self.STATE_DIR / f"{session_id}_anchors.json"

    def _get_lock_path(self, session_id: str) -> Path:
        """Lock file path"""
        return self.STATE_DIR / f"{session_id}_anchors.lock"

    def _generate_anchor_id(self, content: str, timestamp: str) -> str:
        """Generate anchor ID"""
        data = f"{content}{timestamp}"
        return hashlib.md5(data.encode()).hexdigest()[:12]

    def load_anchors(self, session_id: str) -> List[SemanticAnchor]:
        """Load anchor list"""
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
        """Save anchor list"""
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
        """Add new anchor"""
        anchors = self.load_anchors(session_id)

        # Max count limit (LRU)
        max_anchors = self.config.max_anchors or self.MAX_ANCHORS
        if len(anchors) >= max_anchors:
            # Delete from lowest importance (low importance and oldest)
            anchors.sort(key=lambda a: (a.importance, a.timestamp))
            anchors = anchors[1:]  # Delete lowest one

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
        """Detect and add anchor from text"""
        if not self.config.enabled:
            return None

        detected_type = self.detect_anchor_type(text)
        if not detected_type:
            return None

        # Check anchor type config
        anchor_config = self.config.anchor_detection
        if detected_type == AnchorType.DECISION and not anchor_config.decision:
            return None
        if detected_type == AnchorType.ERROR_RESOLVED and not anchor_config.error_resolved:
            return None
        if detected_type == AnchorType.USER_EXPLICIT and not anchor_config.user_explicit:
            return None

        # Determine importance
        importance = self._calculate_importance(detected_type, text)

        # Extract key content
        content = self._extract_key_content(text, detected_type)

        return self.add_anchor(
            session_id=session_id,
            anchor_type=detected_type,
            content=content,
            context=context,
            importance=importance
        )

    def detect_anchor_type(self, text: str) -> Optional[AnchorType]:
        """Detect anchor type from text"""
        for anchor_type, patterns in ANCHOR_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    return anchor_type
        return None

    def _calculate_importance(self, anchor_type: AnchorType, text: str) -> int:
        """Calculate anchor importance (1-5)"""
        base_importance = {
            AnchorType.USER_EXPLICIT: 5,  # User explicit marking has highest importance
            AnchorType.CHECKPOINT: 5,
            AnchorType.ERROR_RESOLVED: 4,
            AnchorType.DECISION: 3,
            AnchorType.FILE_MODIFIED: 2,
        }

        importance = base_importance.get(anchor_type, 2)

        # +1 if emphasis expression present
        if re.search(r'critical|important|key|must', text, re.IGNORECASE):
            importance = min(5, importance + 1)

        return importance

    def _extract_key_content(self, text: str, anchor_type: AnchorType) -> str:
        """Extract key content"""
        # First sentence or first 100 chars
        lines = text.strip().split('\n')
        first_line = lines[0] if lines else text

        # Try to extract content after pattern
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
        """Get recent anchors"""
        anchors = self.load_anchors(session_id)

        # Type filter
        if anchor_types:
            type_values = [t.value for t in anchor_types]
            anchors = [a for a in anchors if a.anchor_type in type_values]

        # Sort by newest + importance
        anchors.sort(key=lambda a: (a.importance, a.timestamp), reverse=True)

        return anchors[:limit]

    def add_file_modified_anchor(
        self,
        session_id: str,
        file_path: str,
        change_type: str = "modified"
    ) -> SemanticAnchor:
        """Add file modified anchor"""
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
        """Add manual checkpoint"""
        return self.add_anchor(
            session_id=session_id,
            anchor_type=AnchorType.CHECKPOINT,
            content=message,
            context=context or {},
            importance=5
        )

    def build_anchors_summary(self, session_id: str, limit: int = 10) -> str:
        """Generate anchor summary message"""
        anchors = self.get_recent_anchors(session_id, limit=limit)
        if not anchors:
            return ""

        lines = ["### Key History"]

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
        """List sessions with anchors"""
        sessions = set()
        for f in self.STATE_DIR.glob("*_anchors.json"):
            session_id = f.stem.replace("_anchors", "")
            sessions.add(session_id)
        return list(sessions)

    def cleanup_old_anchors(self, max_age_days: int = 7) -> int:
        """Cleanup old anchor files"""
        from datetime import timedelta

        cutoff = datetime.now() - timedelta(days=max_age_days)
        deleted = 0

        for f in self.STATE_DIR.glob("*_anchors.json"):
            try:
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if mtime < cutoff:
                    f.unlink()
                    # Delete lock file too
                    lock_file = f.with_suffix('.lock')
                    if lock_file.exists():
                        lock_file.unlink()
                    deleted += 1
            except Exception:
                pass

        return deleted


# Singleton instance
_anchor_manager: Optional[SemanticAnchorManager] = None


def get_semantic_anchor_manager() -> SemanticAnchorManager:
    """Return SemanticAnchorManager singleton instance"""
    global _anchor_manager
    if _anchor_manager is None:
        _anchor_manager = SemanticAnchorManager()
    return _anchor_manager
