#!/usr/bin/env python3
"""
Recovery Wrapper
SessionStart hook that automatically recovers context from previous session

Usage (settings.json):
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
    """Debug log"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def main():
    """Main entrypoint"""
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

        # Load context_resilience module
        sys.path.insert(0, str(HOOKS_DIR))
        from context_resilience import get_config
        from context_resilience.auto_recovery import get_auto_recovery_engine
        from context_resilience.cleanup import run_cleanup

        config = get_config()

        # Run periodic data cleanup
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

        # Initialize session + recover previous session
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
