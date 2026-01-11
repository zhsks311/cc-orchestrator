#!/usr/bin/env python3
"""
Recovery Wrapper
SessionStart 훅으로 동작하여 이전 세션의 컨텍스트를 자동 복구

사용법 (settings.json):
{
  "SessionStart": [
    {
      "matcher": "startup",
      "hooks": [
        {
          "type": "command",
          "command": "python {{HOOKS_PATH}}/recovery_wrapper.py"
        }
      ]
    }
  ]
}
"""

import sys
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

HOOKS_DIR = Path(__file__).parent
LOG_FILE = HOOKS_DIR / "logs" / "recovery.log"


def log(message: str):
    """디버그 로그"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def main():
    """메인 엔트리포인트"""
    log("recovery_wrapper.py executed")

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
        session_id = hook_input.get("session_id", "")
        cwd = hook_input.get("cwd", "")

        log(f"Session start - ID: {session_id[:8] if session_id else 'unknown'}..., CWD: {cwd}")

        # context_resilience 모듈 로드
        sys.path.insert(0, str(HOOKS_DIR))
        from context_resilience import get_config
        from context_resilience.auto_recovery import get_auto_recovery_engine
        from context_resilience.cleanup import run_cleanup

        config = get_config()

        # 주기적 데이터 정리 실행 (cleanup)
        if config.cleanup.enabled:
            try:
                cleanup_result = run_cleanup(force=False)
                if cleanup_result.sessions_deleted > 0 or cleanup_result.anchors_deleted > 0:
                    log(f"Cleanup: {cleanup_result.sessions_deleted} sessions, "
                        f"{cleanup_result.anchors_deleted} anchors deleted")
            except Exception as e:
                log(f"Cleanup error (non-fatal): {e}")

        if not config.enabled or not config.auto_recover:
            log("Auto recovery disabled")
            print(json.dumps({"continue": True}))
            return

        engine = get_auto_recovery_engine()

        # 세션 초기화 + 이전 세션 복구
        result = engine.initialize_session(session_id, cwd)

        system_message = result.get("systemMessage", "")
        if system_message:
            log(f"Recovery message generated ({len(system_message)} chars)")
        else:
            log("No recovery needed")

        print(json.dumps(result))

    except Exception as e:
        log(f"Error during recovery: {e}")
        import traceback
        log(traceback.format_exc())
        print(json.dumps({"continue": True}))


if __name__ == "__main__":
    main()
