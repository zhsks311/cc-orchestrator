#!/usr/bin/env python3
"""
Context Resilience Framework Integration Tests

Run:
    python test_context_resilience.py

Test items:
1. Protected Context save/load/recovery message
2. Semantic Anchors detection/save/query
3. Auto Recovery session finding/recovery
4. Cleanup statistics/cleaning
5. Hook Wrapper simulation
"""

import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path

# Test result counters
passed = 0
failed = 0


def test(name, condition, detail=""):
    """Test helper"""
    global passed, failed
    if condition:
        print(f"  [PASS] {name}")
        passed += 1
    else:
        print(f"  [FAIL] {name} - {detail}")
        failed += 1


def test_protected_context():
    """Protected Context tests"""
    print("\n=== Protected Context ===")

    from context_resilience import get_protected_context_manager

    pcm = get_protected_context_manager()
    session_id = f"test-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    # 1. Update test
    pcm.update(session_id,
        working_directory="/test/project",
        user_intent="Test implementation"
    )
    ctx = pcm.load(session_id)
    test("update & load", ctx is not None and ctx.working_directory == "/test/project")

    # 2. Add decision
    pcm.add_decision(session_id, "Use JWT for auth")
    ctx = pcm.load(session_id)
    test("add_decision", "Use JWT for auth" in ctx.key_decisions)

    # 3. Add active file
    pcm.add_active_file(session_id, "/test/auth.py")
    pcm.add_active_file(session_id, "/test/utils.py")
    ctx = pcm.load(session_id)
    test("add_active_file", len(ctx.active_files) == 2)

    # 4. Prevent duplicate files
    pcm.add_active_file(session_id, "/test/auth.py")
    ctx = pcm.load(session_id)
    test("no duplicate files", len(ctx.active_files) == 2)

    # 5. Add resolved error
    pcm.add_resolved_error(session_id, "Fixed ImportError")
    ctx = pcm.load(session_id)
    test("add_resolved_error", "Fixed ImportError" in ctx.resolved_errors)

    # 6. Generate recovery message
    msg = pcm.build_recovery_message(ctx)
    test("build_recovery_message", len(msg) > 0 and "JWT" in msg)

    # 7. Session list
    sessions = pcm.list_sessions()
    test("list_sessions", session_id in sessions)

    return session_id


def test_semantic_anchors(session_id):
    """Semantic Anchors tests"""
    print("\n=== Semantic Anchors ===")

    from context_resilience import get_semantic_anchor_manager, AnchorType

    sam = get_semantic_anchor_manager()

    # 1. Detect anchor type - decision
    detected = sam.detect_anchor_type("decided: let's go with this approach")
    test("detect DECISION", detected == AnchorType.DECISION)

    detected = sam.detect_anchor_type("Let's go with this approach")
    test("detect DECISION (English)", detected == AnchorType.DECISION)

    # 2. Detect anchor type - error resolved
    detected = sam.detect_anchor_type("Fixed the bug!")
    test("detect ERROR_RESOLVED", detected == AnchorType.ERROR_RESOLVED)

    # 3. Detect anchor type - user explicit
    detected = sam.detect_anchor_type("remember: this is important")
    test("detect USER_EXPLICIT", detected == AnchorType.USER_EXPLICIT)

    # 4. Detect anchor type - none
    detected = sam.detect_anchor_type("Just a normal message")
    test("detect None for normal text", detected is None)

    # 5. Add anchor
    anchor = sam.add_anchor(
        session_id,
        AnchorType.DECISION,
        "Selected PostgreSQL for database",
        context={"reason": "better for complex queries"}
    )
    test("add_anchor", anchor is not None and anchor.id)

    # 6. Add checkpoint
    checkpoint = sam.add_checkpoint(session_id, "Manual checkpoint", {"step": 1})
    test("add_checkpoint", checkpoint is not None and checkpoint.importance == 5)

    # 7. Get recent anchors
    recent = sam.get_recent_anchors(session_id, limit=5)
    test("get_recent_anchors", len(recent) >= 2)

    # 8. Anchor summary
    summary = sam.build_anchors_summary(session_id)
    test("build_anchors_summary", len(summary) > 0)


def test_auto_recovery(session_id):
    """Auto Recovery tests"""
    print("\n=== Auto Recovery ===")

    from context_resilience import get_auto_recovery_engine, get_protected_context_manager

    are = get_auto_recovery_engine()
    pcm = get_protected_context_manager()

    # 1. Check if recovery needed (True if user_intent exists)
    should = are.should_recover(session_id)
    test("should_recover (with content)", should is True, f"got {should}")

    # 2. Empty session doesn't need recovery
    empty_session = "empty-session-test"
    pcm.update(empty_session)  # Empty context (no user_intent, etc.)
    should = are.should_recover(empty_session)
    test("should_recover (empty)", should is False, f"got {should}")

    # 3. Execute recovery
    result = are.recover(session_id)
    test("recover returns continue=True", result.get("continue") == True)
    test("recover has systemMessage", len(result.get("systemMessage", "")) > 0)

    # 4. Find recent session
    recent = are.find_recent_session()
    test("find_recent_session", recent is not None)

    # 5. Detect skill directory
    skills = are.detect_skills_in_directory(str(Path.home()))
    test("detect_skills_in_directory (returns list)", isinstance(skills, list))


def test_cleanup():
    """Cleanup tests"""
    print("\n=== Cleanup ===")

    from context_resilience import get_data_cleanup

    dc = get_data_cleanup()

    # 1. Get statistics
    stats = dc.get_stats()
    test("get_stats", "sessions" in stats and "anchors" in stats)
    test("stats has total_size", "total_size_bytes" in stats)

    # 2. Check if cleanup needed
    should = dc.should_run()
    test("should_run (returns bool)", isinstance(should, bool))

    # 3. Dry run (no actual deletion)
    # Note: Actual cleanup not run in test


def test_hook_wrapper_simulation():
    """Hook Wrapper simulation tests"""
    print("\n=== Hook Wrapper Simulation ===")

    from pathlib import Path

    hooks_dir = Path(__file__).parent

    # 1. Check wrapper file existence
    context_saver = hooks_dir / "context_saver_wrapper.py"
    test("context_saver_wrapper.py exists", context_saver.exists())

    recovery_wrapper = hooks_dir / "recovery_wrapper.py"
    test("recovery_wrapper.py exists", recovery_wrapper.exists())

    # 2. Test wrapper module functions
    sys.path.insert(0, str(hooks_dir))

    try:
        from context_saver_wrapper import (
            extract_file_path,
            extract_todos,
            detect_decision_keywords,
            detect_error_resolved,
        )

        # extract_file_path test
        result = extract_file_path({"file_path": "/test/file.py"})
        test("extract_file_path", result == "/test/file.py")

        # extract_todos test
        todos = extract_todos({"todos": [{"content": "task1", "status": "pending"}]})
        test("extract_todos", len(todos) == 1)

        # detect_decision_keywords test
        test("detect_decision_keywords (positive)", detect_decision_keywords("decided to"))
        test("detect_decision_keywords (negative)", not detect_decision_keywords("normal text"))

        # detect_error_resolved test
        test("detect_error_resolved (positive)", detect_error_resolved("Fixed the bug"))
        test("detect_error_resolved (negative)", not detect_error_resolved("just coding"))

    except ImportError as e:
        test("import wrapper functions", False, str(e))


def test_mcp_memory_tools():
    """MCP Memory Tools tests (TypeScript build required)"""
    print("\n=== MCP Memory Tools ===")

    # Cannot directly test from Python, only check file existence
    project_root = Path(__file__).parent.parent

    store_file = project_root / "src" / "core" / "memory" / "PersistentMemoryStore.ts"
    test("PersistentMemoryStore.ts exists", store_file.exists())

    definitions_file = project_root / "src" / "server" / "tools" / "definitions.ts"
    if definitions_file.exists():
        content = definitions_file.read_text(encoding='utf-8')
        test("memory_save defined", "memory_save" in content)
        test("memory_load defined", "memory_load" in content)
        test("memory_list defined", "memory_list" in content)
        test("memory_delete defined", "memory_delete" in content)
        test("memory_cleanup defined", "memory_cleanup" in content)
    else:
        test("definitions.ts exists", False)


def cleanup_test_data(session_id):
    """Cleanup test data"""
    from pathlib import Path

    state_dir = Path("~/.claude/hooks/state").expanduser()

    # Delete test session files
    if state_dir.exists():
        for pattern in [f"{session_id}_*", "empty-session-test_*", "wrapper-test-session_*"]:
            for f in state_dir.glob(pattern):
                try:
                    f.unlink()
                except:
                    pass


def main():
    global passed, failed

    print("=" * 60)
    print("Context Resilience Framework - Integration Tests")
    print("=" * 60)

    try:
        # Run tests
        session_id = test_protected_context()
        test_semantic_anchors(session_id)
        test_auto_recovery(session_id)
        test_cleanup()
        test_hook_wrapper_simulation()
        test_mcp_memory_tools()

        # Cleanup test data
        print("\n=== Cleanup Test Data ===")
        cleanup_test_data(session_id)
        print("  Test data cleaned up")

    except Exception as e:
        print(f"\n[ERROR] Test execution failed: {e}")
        import traceback
        traceback.print_exc()
        failed += 1

    # Result summary
    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
