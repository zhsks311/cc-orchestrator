#!/usr/bin/env python3
"""Wrapper for test review"""
import sys
import json
import re
from pathlib import Path

HOOKS_DIR = Path(__file__).parent
TEST_PATTERNS = re.compile(r'test|spec|jest|pytest|mvn\s+test|gradle\s+test|npm\s+test|yarn\s+test', re.IGNORECASE)

def main():
    try:
        input_data = sys.stdin.read()
        hook_input = json.loads(input_data)
    except Exception:
        print(json.dumps({"continue": True}))
        return

    command = hook_input.get("tool_input", {}).get("command", "")
    if not TEST_PATTERNS.search(command):
        print(json.dumps({"continue": True}))
        return

    try:
        sys.path.insert(0, str(HOOKS_DIR))
        from review_orchestrator import main as orchestrator_main
        staged_input = json.dumps({"stage": "test", "hook_input": hook_input})
        sys.stdin = __import__('io').StringIO(staged_input)
        orchestrator_main()
    except Exception:
        print(json.dumps({"continue": True}))

if __name__ == "__main__":
    main()
