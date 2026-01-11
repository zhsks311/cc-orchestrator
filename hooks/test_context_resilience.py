#!/usr/bin/env python3
"""
Context Resilience Framework 통합 테스트

실행:
    python test_context_resilience.py

테스트 항목:
1. Protected Context 저장/로드/복구 메시지
2. Semantic Anchors 감지/저장/조회
3. Auto Recovery 세션 찾기/복구
4. Cleanup 통계/정리
5. Hook Wrapper 시뮬레이션
"""

import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path

# 테스트 결과 카운터
passed = 0
failed = 0


def test(name, condition, detail=""):
    """테스트 헬퍼"""
    global passed, failed
    if condition:
        print(f"  [PASS] {name}")
        passed += 1
    else:
        print(f"  [FAIL] {name} - {detail}")
        failed += 1


def test_protected_context():
    """Protected Context 테스트"""
    print("\n=== Protected Context ===")

    from context_resilience import get_protected_context_manager

    pcm = get_protected_context_manager()
    session_id = f"test-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    # 1. 업데이트 테스트
    pcm.update(session_id,
        working_directory="/test/project",
        user_intent="Test implementation"
    )
    ctx = pcm.load(session_id)
    test("update & load", ctx is not None and ctx.working_directory == "/test/project")

    # 2. 결정사항 추가
    pcm.add_decision(session_id, "Use JWT for auth")
    ctx = pcm.load(session_id)
    test("add_decision", "Use JWT for auth" in ctx.key_decisions)

    # 3. 활성 파일 추가
    pcm.add_active_file(session_id, "/test/auth.py")
    pcm.add_active_file(session_id, "/test/utils.py")
    ctx = pcm.load(session_id)
    test("add_active_file", len(ctx.active_files) == 2)

    # 4. 중복 파일 방지
    pcm.add_active_file(session_id, "/test/auth.py")
    ctx = pcm.load(session_id)
    test("no duplicate files", len(ctx.active_files) == 2)

    # 5. 해결한 에러 추가
    pcm.add_resolved_error(session_id, "Fixed ImportError")
    ctx = pcm.load(session_id)
    test("add_resolved_error", "Fixed ImportError" in ctx.resolved_errors)

    # 6. 복구 메시지 생성
    msg = pcm.build_recovery_message(ctx)
    test("build_recovery_message", len(msg) > 0 and "JWT" in msg)

    # 7. 세션 목록
    sessions = pcm.list_sessions()
    test("list_sessions", session_id in sessions)

    return session_id


def test_semantic_anchors(session_id):
    """Semantic Anchors 테스트"""
    print("\n=== Semantic Anchors ===")

    from context_resilience import get_semantic_anchor_manager, AnchorType

    sam = get_semantic_anchor_manager()

    # 1. 앵커 타입 감지 - 결정
    detected = sam.detect_anchor_type("결정했어: 이 방식으로 가자")
    test("detect DECISION (Korean)", detected == AnchorType.DECISION)

    detected = sam.detect_anchor_type("Let's go with this approach")
    test("detect DECISION (English)", detected == AnchorType.DECISION)

    # 2. 앵커 타입 감지 - 에러 해결
    detected = sam.detect_anchor_type("Fixed the bug!")
    test("detect ERROR_RESOLVED", detected == AnchorType.ERROR_RESOLVED)

    # 3. 앵커 타입 감지 - 사용자 명시
    detected = sam.detect_anchor_type("기억해: 이건 중요해")
    test("detect USER_EXPLICIT", detected == AnchorType.USER_EXPLICIT)

    # 4. 앵커 타입 감지 - 없음
    detected = sam.detect_anchor_type("Just a normal message")
    test("detect None for normal text", detected is None)

    # 5. 앵커 추가
    anchor = sam.add_anchor(
        session_id,
        AnchorType.DECISION,
        "Selected PostgreSQL for database",
        context={"reason": "better for complex queries"}
    )
    test("add_anchor", anchor is not None and anchor.id)

    # 6. 체크포인트 추가
    checkpoint = sam.add_checkpoint(session_id, "Manual checkpoint", {"step": 1})
    test("add_checkpoint", checkpoint is not None and checkpoint.importance == 5)

    # 7. 최근 앵커 조회
    recent = sam.get_recent_anchors(session_id, limit=5)
    test("get_recent_anchors", len(recent) >= 2)

    # 8. 앵커 요약
    summary = sam.build_anchors_summary(session_id)
    test("build_anchors_summary", len(summary) > 0)


def test_auto_recovery(session_id):
    """Auto Recovery 테스트"""
    print("\n=== Auto Recovery ===")

    from context_resilience import get_auto_recovery_engine, get_protected_context_manager

    are = get_auto_recovery_engine()
    pcm = get_protected_context_manager()

    # 1. 복구 필요 여부 확인 (user_intent가 있으면 True)
    should = are.should_recover(session_id)
    test("should_recover (with content)", should is True, f"got {should}")

    # 2. 빈 세션은 복구 불필요
    empty_session = "empty-session-test"
    pcm.update(empty_session)  # 빈 컨텍스트 (user_intent 등 없음)
    should = are.should_recover(empty_session)
    test("should_recover (empty)", should is False, f"got {should}")

    # 3. 복구 실행
    result = are.recover(session_id)
    test("recover returns continue=True", result.get("continue") == True)
    test("recover has systemMessage", len(result.get("systemMessage", "")) > 0)

    # 4. 최근 세션 찾기
    recent = are.find_recent_session()
    test("find_recent_session", recent is not None)

    # 5. 스킬 디렉토리 감지
    skills = are.detect_skills_in_directory(str(Path.home()))
    test("detect_skills_in_directory (returns list)", isinstance(skills, list))


def test_cleanup():
    """Cleanup 테스트"""
    print("\n=== Cleanup ===")

    from context_resilience import get_data_cleanup

    dc = get_data_cleanup()

    # 1. 통계 조회
    stats = dc.get_stats()
    test("get_stats", "sessions" in stats and "anchors" in stats)
    test("stats has total_size", "total_size_bytes" in stats)

    # 2. 정리 필요 여부
    should = dc.should_run()
    test("should_run (returns bool)", isinstance(should, bool))

    # 3. dry run (실제 삭제 없이)
    # Note: 실제 정리는 테스트에서 실행하지 않음


def test_hook_wrapper_simulation():
    """Hook Wrapper 시뮬레이션 테스트"""
    print("\n=== Hook Wrapper Simulation ===")

    from pathlib import Path

    hooks_dir = Path(__file__).parent

    # 1. Wrapper 파일 존재 확인
    context_saver = hooks_dir / "context_saver_wrapper.py"
    test("context_saver_wrapper.py exists", context_saver.exists())

    recovery_wrapper = hooks_dir / "recovery_wrapper.py"
    test("recovery_wrapper.py exists", recovery_wrapper.exists())

    # 2. Wrapper 모듈 함수 테스트
    sys.path.insert(0, str(hooks_dir))

    try:
        from context_saver_wrapper import (
            extract_file_path,
            extract_todos,
            detect_decision_keywords,
            detect_error_resolved,
        )

        # extract_file_path 테스트
        result = extract_file_path({"file_path": "/test/file.py"})
        test("extract_file_path", result == "/test/file.py")

        # extract_todos 테스트
        todos = extract_todos({"todos": [{"content": "task1", "status": "pending"}]})
        test("extract_todos", len(todos) == 1)

        # detect_decision_keywords 테스트
        test("detect_decision_keywords (positive)", detect_decision_keywords("결정했어"))
        test("detect_decision_keywords (negative)", not detect_decision_keywords("일반 텍스트"))

        # detect_error_resolved 테스트
        test("detect_error_resolved (positive)", detect_error_resolved("Fixed the bug"))
        test("detect_error_resolved (negative)", not detect_error_resolved("just coding"))

    except ImportError as e:
        test("import wrapper functions", False, str(e))


def test_mcp_memory_tools():
    """MCP Memory Tools 테스트 (TypeScript 빌드 필요)"""
    print("\n=== MCP Memory Tools ===")

    # Python에서 직접 테스트할 수 없으므로 파일 존재 확인만
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
    """테스트 데이터 정리"""
    from pathlib import Path

    state_dir = Path("~/.claude/hooks/state").expanduser()

    # 테스트 세션 파일 삭제
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
        # 테스트 실행
        session_id = test_protected_context()
        test_semantic_anchors(session_id)
        test_auto_recovery(session_id)
        test_cleanup()
        test_hook_wrapper_simulation()
        test_mcp_memory_tools()

        # 테스트 데이터 정리
        print("\n=== Cleanup Test Data ===")
        cleanup_test_data(session_id)
        print("  Test data cleaned up")

    except Exception as e:
        print(f"\n[ERROR] Test execution failed: {e}")
        import traceback
        traceback.print_exc()
        failed += 1

    # 결과 요약
    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
