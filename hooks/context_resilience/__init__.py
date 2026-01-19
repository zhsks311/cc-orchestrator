"""
Context Resilience Framework
System to prevent context loss due to compaction
"""

from .protected_context import (
    ProtectedContext,
    ProtectedContextManager,
    get_protected_context_manager,
)
from .config import (
    ContextResilienceConfig,
    CleanupConfig,
    AnchorDetectionConfig,
    load_config,
    get_config,
    reload_config,
)
from .semantic_anchors import (
    AnchorType,
    SemanticAnchor,
    SemanticAnchorManager,
    get_semantic_anchor_manager,
    ANCHOR_PATTERNS,
)
from .auto_recovery import (
    AutoRecoveryEngine,
    get_auto_recovery_engine,
)
from .cleanup import (
    DataCleanup,
    CleanupResult,
    get_data_cleanup,
    run_cleanup,
)

__all__ = [
    # Protected Context
    'ProtectedContext',
    'ProtectedContextManager',
    'get_protected_context_manager',
    # Config
    'ContextResilienceConfig',
    'CleanupConfig',
    'AnchorDetectionConfig',
    'load_config',
    'get_config',
    'reload_config',
    # Semantic Anchors
    'AnchorType',
    'SemanticAnchor',
    'SemanticAnchorManager',
    'get_semantic_anchor_manager',
    'ANCHOR_PATTERNS',
    # Auto Recovery
    'AutoRecoveryEngine',
    'get_auto_recovery_engine',
    # Cleanup
    'DataCleanup',
    'CleanupResult',
    'get_data_cleanup',
    'run_cleanup',
]
