"""
Data Cleanup Module
Handles cleanup of session files, anchors, and memory data

Cleanup targets:
1. Expired session files (_protected.json)
2. Expired anchor files (_anchors.json)
3. TTL-exceeded memory data
4. Empty directories

Cleanup triggers:
- Periodic execution from SessionStart hook
- Manual cleanup command
"""

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .config import get_config, CleanupConfig


@dataclass
class CleanupResult:
    """Cleanup result"""
    sessions_deleted: int = 0
    anchors_deleted: int = 0
    memory_deleted: int = 0
    bytes_freed: int = 0
    errors: List[str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []


class DataCleanup:
    """Data cleanup manager"""

    STATE_DIR = Path("~/.claude/hooks/state").expanduser()
    MEMORY_DIR = Path("~/.cco/memory").expanduser()
    LAST_CLEANUP_FILE = Path("~/.claude/hooks/state/.last_cleanup").expanduser()

    def __init__(self, config: Optional[CleanupConfig] = None):
        self.config = config or get_config().cleanup

    def should_run(self) -> bool:
        """Check if cleanup should run"""
        if not self.config.enabled:
            return False

        # Check last cleanup time
        if not self.LAST_CLEANUP_FILE.exists():
            return True

        try:
            last_cleanup = datetime.fromisoformat(
                self.LAST_CLEANUP_FILE.read_text().strip()
            )
            interval = timedelta(hours=self.config.cleanup_interval_hours)
            return datetime.now() - last_cleanup > interval
        except (ValueError, OSError):
            return True

    def run(self, force: bool = False) -> CleanupResult:
        """Execute full cleanup"""
        if not force and not self.should_run():
            return CleanupResult()

        result = CleanupResult()

        # 1. Cleanup session files
        session_result = self.cleanup_sessions()
        result.sessions_deleted = session_result[0]
        result.bytes_freed += session_result[1]

        # 2. Cleanup anchor files
        anchor_result = self.cleanup_anchors()
        result.anchors_deleted = anchor_result[0]
        result.bytes_freed += anchor_result[1]

        # 3. Cleanup memory files
        memory_result = self.cleanup_memory()
        result.memory_deleted = memory_result[0]
        result.bytes_freed += memory_result[1]

        # 4. Cleanup empty directories
        self.cleanup_empty_dirs()

        # Record last cleanup time
        self._save_last_cleanup_time()

        return result

    def cleanup_sessions(self) -> Tuple[int, int]:
        """Delete expired session files"""
        deleted = 0
        freed = 0

        if not self.STATE_DIR.exists():
            return (deleted, freed)

        cutoff = datetime.now() - timedelta(days=self.config.session_retention_days)

        for f in self.STATE_DIR.glob("*_protected.json"):
            try:
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if mtime < cutoff:
                    size = f.stat().st_size
                    f.unlink()
                    freed += size
                    deleted += 1

                    # Delete related files too
                    session_id = f.stem.replace("_protected", "")
                    self._delete_related_files(session_id)
            except OSError:
                pass

        return (deleted, freed)

    def cleanup_anchors(self) -> Tuple[int, int]:
        """Delete expired anchor files"""
        deleted = 0
        freed = 0

        if not self.STATE_DIR.exists():
            return (deleted, freed)

        cutoff = datetime.now() - timedelta(days=self.config.session_retention_days)

        for f in self.STATE_DIR.glob("*_anchors.json"):
            try:
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if mtime < cutoff:
                    size = f.stat().st_size
                    f.unlink()
                    freed += size
                    deleted += 1

                    # Delete lock file too
                    lock_file = f.with_suffix('.lock')
                    if lock_file.exists():
                        lock_file.unlink()
            except OSError:
                pass

        return (deleted, freed)

    def cleanup_memory(self) -> Tuple[int, int]:
        """Delete expired memory files"""
        deleted = 0
        freed = 0

        if not self.MEMORY_DIR.exists():
            return (deleted, freed)

        for scope in ['session', 'project', 'global']:
            scope_dir = self.MEMORY_DIR / scope
            if not scope_dir.exists():
                continue

            result = self._cleanup_memory_dir(scope_dir)
            deleted += result[0]
            freed += result[1]

        return (deleted, freed)

    def _cleanup_memory_dir(self, dir_path: Path) -> Tuple[int, int]:
        """Cleanup files in memory directory"""
        deleted = 0
        freed = 0

        for item in dir_path.iterdir():
            if item.is_dir():
                result = self._cleanup_memory_dir(item)
                deleted += result[0]
                freed += result[1]
            elif item.suffix == '.json' and not item.name.startswith('_'):
                try:
                    content = json.loads(item.read_text(encoding='utf-8'))
                    expires_at = content.get('expiresAt')

                    if expires_at:
                        if datetime.fromisoformat(expires_at) < datetime.now():
                            size = item.stat().st_size
                            item.unlink()
                            freed += size
                            deleted += 1
                except (json.JSONDecodeError, OSError, ValueError):
                    pass

        return (deleted, freed)

    def cleanup_empty_dirs(self) -> int:
        """Delete empty directories"""
        removed = 0

        for base_dir in [self.STATE_DIR, self.MEMORY_DIR]:
            if not base_dir.exists():
                continue

            for dir_path in sorted(base_dir.rglob("*"), reverse=True):
                if dir_path.is_dir():
                    try:
                        if not any(dir_path.iterdir()):
                            dir_path.rmdir()
                            removed += 1
                    except OSError:
                        pass

        return removed

    def _delete_related_files(self, session_id: str) -> None:
        """Delete session-related files"""
        patterns = [
            f"{session_id}_anchors.json",
            f"{session_id}_anchors.lock",
            f"{session_id}_protected.lock",
        ]

        for pattern in patterns:
            path = self.STATE_DIR / pattern
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass

    def _save_last_cleanup_time(self) -> None:
        """Save last cleanup time"""
        try:
            self.LAST_CLEANUP_FILE.parent.mkdir(parents=True, exist_ok=True)
            self.LAST_CLEANUP_FILE.write_text(datetime.now().isoformat())
        except OSError:
            pass

    def get_stats(self) -> Dict:
        """Get current data statistics"""
        stats = {
            "sessions": {"count": 0, "size_bytes": 0},
            "anchors": {"count": 0, "size_bytes": 0},
            "memory": {
                "session": {"count": 0, "size_bytes": 0},
                "project": {"count": 0, "size_bytes": 0},
                "global": {"count": 0, "size_bytes": 0},
            },
            "total_size_bytes": 0,
        }

        # Session file statistics
        if self.STATE_DIR.exists():
            for f in self.STATE_DIR.glob("*_protected.json"):
                stats["sessions"]["count"] += 1
                stats["sessions"]["size_bytes"] += f.stat().st_size

            for f in self.STATE_DIR.glob("*_anchors.json"):
                stats["anchors"]["count"] += 1
                stats["anchors"]["size_bytes"] += f.stat().st_size

        # Memory file statistics
        if self.MEMORY_DIR.exists():
            for scope in ['session', 'project', 'global']:
                scope_dir = self.MEMORY_DIR / scope
                if scope_dir.exists():
                    for f in scope_dir.rglob("*.json"):
                        if not f.name.startswith('_'):
                            stats["memory"][scope]["count"] += 1
                            stats["memory"][scope]["size_bytes"] += f.stat().st_size

        # Total size
        stats["total_size_bytes"] = (
            stats["sessions"]["size_bytes"] +
            stats["anchors"]["size_bytes"] +
            sum(s["size_bytes"] for s in stats["memory"].values())
        )

        return stats

    def enforce_limits(self) -> CleanupResult:
        """Enforce size/count limits"""
        result = CleanupResult()

        # Anchor count limit (per session)
        if self.STATE_DIR.exists():
            for f in self.STATE_DIR.glob("*_anchors.json"):
                try:
                    content = json.loads(f.read_text(encoding='utf-8'))
                    if len(content) > self.config.max_anchors_per_session:
                        # Delete from oldest (low importance first)
                        content.sort(key=lambda a: (a.get('importance', 1), a.get('timestamp', '')))
                        excess = len(content) - self.config.max_anchors_per_session
                        content = content[excess:]
                        f.write_text(json.dumps(content, indent=2, ensure_ascii=False))
                        result.anchors_deleted += excess
                except (json.JSONDecodeError, OSError):
                    pass

        # Memory size limit
        stats = self.get_stats()
        max_bytes = self.config.max_memory_size_mb * 1024 * 1024

        if stats["total_size_bytes"] > max_bytes:
            # Delete LRU style (oldest files first)
            all_files = []

            if self.MEMORY_DIR.exists():
                for f in self.MEMORY_DIR.rglob("*.json"):
                    if not f.name.startswith('_'):
                        all_files.append((f, f.stat().st_mtime, f.stat().st_size))

            all_files.sort(key=lambda x: x[1])  # Sort by mtime

            target = stats["total_size_bytes"] * 0.8  # Reduce to 80%
            current = stats["total_size_bytes"]

            for file_path, _, size in all_files:
                if current <= target:
                    break
                try:
                    file_path.unlink()
                    current -= size
                    result.memory_deleted += 1
                    result.bytes_freed += size
                except OSError:
                    pass

        return result


# Convenience function
def get_data_cleanup() -> DataCleanup:
    """Return DataCleanup instance"""
    return DataCleanup()


def run_cleanup(force: bool = False) -> CleanupResult:
    """Execute cleanup"""
    return get_data_cleanup().run(force=force)
