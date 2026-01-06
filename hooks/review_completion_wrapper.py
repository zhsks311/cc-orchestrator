#!/usr/bin/env python3
"""Wrapper for completion review"""
import sys
import json
from datetime import datetime
from pathlib import Path

HOOKS_DIR = Path(__file__).parent
LOG_FILE = HOOKS_DIR / "logs" / "hook-debug.log"

def log(message: str):
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass

def main():
    log("review_completion_wrapper.py executed")
    try:
        input_data = sys.stdin.read()
        log(f"INPUT received (length: {len(input_data)})")
    except Exception as e:
        log(f"Error reading stdin: {e}")
        print(json.dumps({"continue": True}))
        return

    try:
        sys.path.insert(0, str(HOOKS_DIR))
        from completion_orchestrator import main as orchestrator_main
        sys.stdin = __import__('io').StringIO(input_data)
        orchestrator_main()
    except Exception as e:
        log(f"Error in orchestrator: {e}")
        print(json.dumps({"continue": True}))

if __name__ == "__main__":
    main()
