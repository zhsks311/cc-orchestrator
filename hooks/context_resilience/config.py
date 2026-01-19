"""
Context Resilience Configuration
Config file loading and default value management
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any, Optional


@dataclass
class CleanupConfig:
    """Data cleanup settings"""
    enabled: bool = True
    session_retention_days: int = 14  # 14 day retention
    max_anchors_per_session: int = 50
    max_memory_size_mb: int = 100
    max_memory_files: int = 1000
    cleanup_interval_hours: int = 24


@dataclass
class AnchorDetectionConfig:
    """Anchor detection settings"""
    decision: bool = True
    error_resolved: bool = True
    user_explicit: bool = True
    file_modified: bool = True


@dataclass
class ContextResilienceConfig:
    """Context Resilience overall settings"""
    enabled: bool = True
    auto_save: bool = True
    auto_recover: bool = True
    max_anchors: int = 50
    recovery_message_max_length: int = 2000
    anchor_detection: AnchorDetectionConfig = field(default_factory=AnchorDetectionConfig)
    cleanup: CleanupConfig = field(default_factory=CleanupConfig)
    protected_fields: list = field(default_factory=lambda: [
        "working_directory",
        "active_skills",
        "user_intent",
        "key_decisions",
        "resolved_errors",
        "pending_tasks"
    ])


def load_config(config_path: str = "~/.claude/hooks/config.json") -> ContextResilienceConfig:
    """Load config file (use defaults if not exists)"""
    path = Path(config_path).expanduser()

    if not path.exists():
        return ContextResilienceConfig()

    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        cr_config = data.get("context_resilience", {})

        # Parse nested config
        anchor_config = AnchorDetectionConfig(
            **cr_config.get("anchor_detection", {})
        ) if "anchor_detection" in cr_config else AnchorDetectionConfig()

        cleanup_config = CleanupConfig(
            **cr_config.get("cleanup", {})
        ) if "cleanup" in cr_config else CleanupConfig()

        return ContextResilienceConfig(
            enabled=cr_config.get("enabled", True),
            auto_save=cr_config.get("auto_save", True),
            auto_recover=cr_config.get("auto_recover", True),
            max_anchors=cr_config.get("max_anchors", 50),
            recovery_message_max_length=cr_config.get("recovery_message_max_length", 2000),
            anchor_detection=anchor_config,
            cleanup=cleanup_config,
            protected_fields=cr_config.get("protected_fields", [
                "working_directory", "active_skills", "user_intent",
                "key_decisions", "resolved_errors", "pending_tasks"
            ])
        )
    except (json.JSONDecodeError, KeyError):
        return ContextResilienceConfig()


def save_config(config: ContextResilienceConfig, config_path: str = "~/.claude/hooks/config.json") -> None:
    """Save config file (merge with existing config)"""
    path = Path(config_path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)

    # Load existing config
    existing = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            existing = {}

    # Update context_resilience section
    existing["context_resilience"] = {
        "enabled": config.enabled,
        "auto_save": config.auto_save,
        "auto_recover": config.auto_recover,
        "max_anchors": config.max_anchors,
        "recovery_message_max_length": config.recovery_message_max_length,
        "anchor_detection": {
            "decision": config.anchor_detection.decision,
            "error_resolved": config.anchor_detection.error_resolved,
            "user_explicit": config.anchor_detection.user_explicit,
            "file_modified": config.anchor_detection.file_modified,
        },
        "cleanup": {
            "enabled": config.cleanup.enabled,
            "session_retention_days": config.cleanup.session_retention_days,
            "max_anchors_per_session": config.cleanup.max_anchors_per_session,
            "max_memory_size_mb": config.cleanup.max_memory_size_mb,
            "max_memory_files": config.cleanup.max_memory_files,
            "cleanup_interval_hours": config.cleanup.cleanup_interval_hours,
        },
        "protected_fields": config.protected_fields,
    }

    path.write_text(
        json.dumps(existing, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )


# Global config cache
_config: Optional[ContextResilienceConfig] = None


def get_config() -> ContextResilienceConfig:
    """Return global config (cached)"""
    global _config
    if _config is None:
        _config = load_config()
    return _config


def reload_config() -> ContextResilienceConfig:
    """Reload config"""
    global _config
    _config = load_config()
    return _config
