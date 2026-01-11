#!/usr/bin/env python3
"""
Context Saver Wrapper
PostToolUse 훅으로 동작하여 Edit, Write, TodoWrite 후 컨텍스트 자동 저장

사용법 (settings.json):
{
  "PostToolUse": [
    {
      "matcher": "Edit|Write|TodoWrite",
      "hooks": [
        {
          "type": "command",
          "command": "python {{HOOKS_PATH}}/context_saver_wrapper.py"
        }
      ]
    }
  ]
}
"""

import sys
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

HOOKS_DIR = Path(__file__).parent
LOG_FILE = HOOKS_DIR / "logs" / "context-saver.log"

# Lazy import flag
_resilience_imported = False


def log(message: str):
    """디버그 로그"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def extract_file_path(tool_input: Dict[str, Any]) -> Optional[str]:
    """도구 입력에서 파일 경로 추출"""
    return tool_input.get("file_path")


def extract_todos(tool_input: Dict[str, Any]) -> list:
    """TodoWrite 입력에서 todo 목록 추출"""
    return tool_input.get("todos", [])


def detect_decision_keywords(text: str) -> bool:
    """결정 관련 키워드 감지"""
    patterns = [
        r'결정|선택|이렇게\s*하자|방법으로',
        r'decided|choose|let\'s go with|approach'
    ]
    for pattern in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def detect_error_resolved(text: str) -> bool:
    """에러 해결 키워드 감지"""
    patterns = [
        r'해결|수정\s*완료|고침|에러.*고침',
        r'fixed|resolved|working now|bug.*fixed'
    ]
    for pattern in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def process_edit_write(session_id: str, tool_name: str, tool_input: Dict[str, Any], cwd: str):
    """Edit/Write 도구 처리"""
    sys.path.insert(0, str(HOOKS_DIR))
    from context_resilience import (
        get_protected_context_manager,
        get_config,
        get_semantic_anchor_manager,
    )

    config = get_config()
    if not config.enabled or not config.auto_save:
        return

    manager = get_protected_context_manager()
    anchor_manager = get_semantic_anchor_manager()

    # 파일 경로 저장
    file_path = extract_file_path(tool_input)
    if file_path:
        manager.add_active_file(session_id, file_path)
        log(f"Added active file: {file_path}")

        # Semantic Anchor: 파일 수정 기록
        change_type = "created" if tool_name == "Write" else "modified"
        anchor_manager.add_file_modified_anchor(session_id, file_path, change_type)
        log(f"Added file anchor: {file_path} ({change_type})")

    # 작업 디렉토리 저장
    if cwd:
        manager.set_working_directory(session_id, cwd)

    # CLAUDE.md 해시 업데이트
    if cwd:
        claude_md_hash = manager.compute_claude_md_hash(cwd)
        if claude_md_hash:
            manager.update(session_id, claude_md_hash=claude_md_hash)


def process_todo_write(session_id: str, tool_input: Dict[str, Any], cwd: str):
    """TodoWrite 도구 처리"""
    sys.path.insert(0, str(HOOKS_DIR))
    from context_resilience import (
        get_protected_context_manager,
        get_config,
        get_semantic_anchor_manager,
        AnchorType,
    )

    config = get_config()
    if not config.enabled or not config.auto_save:
        return

    manager = get_protected_context_manager()
    anchor_manager = get_semantic_anchor_manager()

    todos = extract_todos(tool_input)
    if not todos:
        return

    # 미완료 작업 추출
    pending = [
        t.get("content", "")
        for t in todos
        if t.get("status") in ("pending", "in_progress")
    ]
    if pending:
        manager.set_pending_tasks(session_id, pending)
        log(f"Updated pending tasks: {len(pending)} items")

    # 완료된 작업에서 결정사항/에러해결 추출
    completed = [
        t.get("content", "")
        for t in todos
        if t.get("status") == "completed"
    ]

    for task in completed:
        # 결정 키워드 감지
        if detect_decision_keywords(task):
            manager.add_decision(session_id, f"[완료] {task}")
            anchor_manager.add_anchor(
                session_id,
                AnchorType.DECISION,
                f"[Todo 완료] {task}",
                context={"source": "TodoWrite"},
                importance=3
            )
            log(f"Added decision anchor: {task}")

        # 에러 해결 키워드 감지
        if detect_error_resolved(task):
            manager.add_resolved_error(session_id, task)
            anchor_manager.add_anchor(
                session_id,
                AnchorType.ERROR_RESOLVED,
                f"[해결] {task}",
                context={"source": "TodoWrite"},
                importance=4
            )
            log(f"Added error resolved anchor: {task}")

    # 모든 Todo 완료 시 자동 체크포인트
    if todos and all(t.get("status") == "completed" for t in todos):
        completed_summary = ", ".join(completed[:3])
        if len(completed) > 3:
            completed_summary += f" 외 {len(completed) - 3}개"

        anchor_manager.add_checkpoint(
            session_id,
            f"[Todo 전체 완료] {completed_summary}",
            context={
                "completed_count": len(completed),
                "tasks": completed[:5]  # 최대 5개만 저장
            }
        )
        log(f"Added checkpoint: All {len(completed)} todos completed")


def main():
    """메인 엔트리포인트"""
    log("context_saver_wrapper.py executed")

    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"continue": True}))
            return

        hook_input = json.loads(input_data)
    except Exception as e:
        log(f"Error reading input: {e}")
        print(json.dumps({"continue": True}))
        return

    try:
        session_id = hook_input.get("session_id", "unknown")
        tool_name = hook_input.get("tool_name", "")
        tool_input = hook_input.get("tool_input", {})
        cwd = hook_input.get("cwd", "")

        log(f"Processing tool: {tool_name}, session: {session_id[:8]}...")

        if tool_name in ("Edit", "Write"):
            process_edit_write(session_id, tool_name, tool_input, cwd)
        elif tool_name == "TodoWrite":
            process_todo_write(session_id, tool_input, cwd)

        # 항상 continue=True 반환 (블로킹하지 않음)
        print(json.dumps({"continue": True}))

    except Exception as e:
        log(f"Error processing: {e}")
        print(json.dumps({"continue": True}))


if __name__ == "__main__":
    main()
