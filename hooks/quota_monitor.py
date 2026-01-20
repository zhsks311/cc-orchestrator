"""
Quota Monitoring and Fallback Strategy
External LLM quota tracking and automatic fallback
"""
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from enum import Enum


class QuotaStatus(Enum):
    """Quota status"""
    AVAILABLE = "available"      # Available
    LOW = "low"                  # Low (warning)
    EXHAUSTED = "exhausted"      # Exhausted
    UNKNOWN = "unknown"          # Unknown


@dataclass
class AdapterQuota:
    """Quota info per adapter"""
    adapter_name: str
    status: QuotaStatus
    last_success: Optional[str] = None
    last_failure: Optional[str] = None
    failure_count: int = 0
    success_count: int = 0
    consecutive_failures: int = 0
    cooldown_until: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            **asdict(self),
            "status": self.status.value
        }


class QuotaMonitor:
    """
    Quota monitoring system

    Features:
    - Track success/failure per adapter
    - Auto cooldown on consecutive failures
    - Daily reset
    """

    def __init__(self, state_dir: str = "~/.claude/hooks/state"):
        self.state_dir = Path(state_dir).expanduser()
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.quota_file = self.state_dir / "quota_state.json"
        self.quotas: Dict[str, AdapterQuota] = {}
        self._load_state()

    def _load_state(self) -> None:
        """Load state"""
        if self.quota_file.exists():
            try:
                data = json.loads(self.quota_file.read_text(encoding="utf-8"))

                # Date check - reset on new day
                last_date = data.get("date")
                today = datetime.now().strftime("%Y-%m-%d")

                if last_date != today:
                    self.quotas = {}
                    self._save_state()
                    return

                for name, q in data.get("quotas", {}).items():
                    self.quotas[name] = AdapterQuota(
                        adapter_name=name,
                        status=QuotaStatus(q.get("status", "unknown")),
                        last_success=q.get("last_success"),
                        last_failure=q.get("last_failure"),
                        failure_count=q.get("failure_count", 0),
                        success_count=q.get("success_count", 0),
                        consecutive_failures=q.get("consecutive_failures", 0),
                        cooldown_until=q.get("cooldown_until")
                    )
            except (json.JSONDecodeError, KeyError, ValueError):
                # ValueError: invalid QuotaStatus value in state file
                self.quotas = {}

    def _save_state(self) -> None:
        """Save state"""
        data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "updated_at": datetime.now().isoformat(),
            "quotas": {name: q.to_dict() for name, q in self.quotas.items()}
        }
        self.quota_file.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    def record_success(self, adapter_name: str) -> None:
        """Record success"""
        if adapter_name not in self.quotas:
            self.quotas[adapter_name] = AdapterQuota(
                adapter_name=adapter_name,
                status=QuotaStatus.AVAILABLE
            )

        quota = self.quotas[adapter_name]
        quota.success_count += 1
        quota.consecutive_failures = 0
        quota.last_success = datetime.now().isoformat()
        quota.status = QuotaStatus.AVAILABLE
        quota.cooldown_until = None
        self._save_state()

    def record_failure(self, adapter_name: str, error: str) -> None:
        """Record failure"""
        if adapter_name not in self.quotas:
            self.quotas[adapter_name] = AdapterQuota(
                adapter_name=adapter_name,
                status=QuotaStatus.UNKNOWN
            )

        quota = self.quotas[adapter_name]
        quota.failure_count += 1
        quota.consecutive_failures += 1
        quota.last_failure = datetime.now().isoformat()

        # Determine quota exhaustion
        quota_keywords = ["quota", "limit", "exceeded", "rate", "429", "exhausted"]
        error_str = str(error) if error else ""
        is_quota_error = any(kw in error_str.lower() for kw in quota_keywords)

        if is_quota_error or quota.consecutive_failures >= 3:
            quota.status = QuotaStatus.EXHAUSTED
            cooldown_end = datetime.now() + timedelta(minutes=30)
            quota.cooldown_until = cooldown_end.isoformat()
        elif quota.consecutive_failures >= 2:
            quota.status = QuotaStatus.LOW

        self._save_state()

    def is_available(self, adapter_name: str) -> bool:
        """Check adapter availability"""
        if adapter_name not in self.quotas:
            return True

        quota = self.quotas[adapter_name]

        if quota.cooldown_until:
            try:
                cooldown_end = datetime.fromisoformat(quota.cooldown_until)
            except ValueError:
                # Invalid date format - clear cooldown
                quota.cooldown_until = None
                self._save_state()
                return quota.status != QuotaStatus.EXHAUSTED
            if datetime.now() < cooldown_end:
                return False
            quota.status = QuotaStatus.UNKNOWN
            quota.consecutive_failures = 0
            quota.cooldown_until = None
            self._save_state()

        return quota.status != QuotaStatus.EXHAUSTED

    def get_available_adapters(self, adapter_names: List[str]) -> List[str]:
        """Get list of available adapters"""
        return [name for name in adapter_names if self.is_available(name)]

    def get_summary(self) -> Dict[str, Any]:
        """Quota summary"""
        return {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "adapters": {
                name: {
                    "status": q.status.value,
                    "success": q.success_count,
                    "failures": q.failure_count
                }
                for name, q in self.quotas.items()
            }
        }


_quota_monitor: Optional[QuotaMonitor] = None


def get_quota_monitor() -> QuotaMonitor:
    """Quota monitor singleton"""
    global _quota_monitor
    if _quota_monitor is None:
        _quota_monitor = QuotaMonitor()
    return _quota_monitor
