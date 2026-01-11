#!/usr/bin/env python3
"""
Checkpoint Wrapper
명령줄에서 수동 체크포인트를 생성하는 스크립트

사용법:
    python checkpoint_wrapper.py "체크포인트 메시지" [session_id]

/checkpoint 스킬에서 Bash 도구로 호출:
    python ~/.claude/hooks/checkpoint_wrapper.py "인증 시스템 구현 완료"
"""

import sys
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

HOOKS_DIR = Path(__file__).parent
LOG_FILE = HOOKS_DIR / "logs" / "checkpoint.log"


def log(message: str):
    """디버그 로그"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def get_current_session_id() -> str:
    """현재 세션 ID 추정 (가장 최근 세션)"""
    sys.path.insert(0, str(HOOKS_DIR))
    from context_resilience import get_protected_context_manager

    manager = get_protected_context_manager()
    sessions = manager.list_sessions()

    if not sessions:
        return f"checkpoint-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    # 가장 최근 세션 찾기
    latest_session = None
    latest_time = None

    for session_id in sessions:
        ctx = manager.load(session_id)
        if ctx and ctx.updated_at:
            try:
                updated = datetime.fromisoformat(ctx.updated_at)
                if latest_time is None or updated > latest_time:
                    latest_time = updated
                    latest_session = session_id
            except ValueError:
                pass

    return latest_session or sessions[-1]


def create_checkpoint(message: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """체크포인트 생성"""
    sys.path.insert(0, str(HOOKS_DIR))
    from context_resilience import (
        get_protected_context_manager,
        get_semantic_anchor_manager,
    )

    if not session_id:
        session_id = get_current_session_id()

    manager = get_protected_context_manager()
    anchor_manager = get_semantic_anchor_manager()

    # 현재 컨텍스트 로드
    context = manager.load(session_id)

    # 체크포인트 컨텍스트 구성
    checkpoint_context = {
        "timestamp": datetime.now().isoformat(),
        "active_files": context.active_files if context else [],
        "pending_tasks": context.pending_tasks if context else [],
        "key_decisions": context.key_decisions[-3:] if context and context.key_decisions else [],
    }

    # 앵커 추가
    anchor = anchor_manager.add_checkpoint(
        session_id=session_id,
        message=message,
        context=checkpoint_context
    )

    log(f"Checkpoint created: {message} (session: {session_id[:8]}...)")

    return {
        "success": True,
        "anchor_id": anchor.id if anchor else None,
        "session_id": session_id,
        "message": message,
        "timestamp": checkpoint_context["timestamp"],
        "active_files_count": len(checkpoint_context["active_files"]),
    }


def main():
    """메인 엔트리포인트"""
    log("checkpoint_wrapper.py executed")

    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "체크포인트 메시지가 필요합니다.",
            "usage": "python checkpoint_wrapper.py \"메시지\" [session_id]"
        }))
        sys.exit(1)

    message = sys.argv[1]
    session_id = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        result = create_checkpoint(message, session_id)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    except Exception as e:
        log(f"Error: {e}")
        import traceback
        log(traceback.format_exc())
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
