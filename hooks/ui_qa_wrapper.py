#!/usr/bin/env python3
"""
UI QA Wrapper - PostToolUse hook for automatic UI quality assurance

Triggers visual UI testing when frontend files are modified.
Uses Claude in Chrome extension's MCP tools for screenshots and
multimodal-analyzer agent for UI analysis.
"""

import sys
import json
import re
import socket
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

# ============================================================================
# Constants
# ============================================================================
HOOKS_DIR = Path(__file__).parent
CONFIG_FILE = HOOKS_DIR / "ui_qa_config.json"
LOG_FILE = HOOKS_DIR / "logs" / "ui-qa.log"
PROMPT_FILE = HOOKS_DIR / "prompts" / "ui_qa.txt"

# Frontend file patterns
FRONTEND_PATTERNS = re.compile(
    r'\.(tsx|jsx|vue|svelte|css|scss|sass|less)$',
    re.IGNORECASE
)

# Excluded directories
EXCLUDED_DIRS = [
    'node_modules', 'dist', 'build', '.next', '.nuxt',
    '.svelte-kit', 'coverage', '__pycache__', '.git'
]


def log(message: str):
    """Debug logging"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def load_config() -> Dict[str, Any]:
    """Load UI QA configuration"""
    try:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        log(f"Config load error: {e}")
    return {"enabled": False}


def is_frontend_file(file_path: str, config: Dict[str, Any]) -> bool:
    """Check if file is a frontend file that warrants UI QA"""
    if not file_path:
        return False

    # Check excluded directories
    path_lower = file_path.lower().replace('\\', '/')
    # Normalize path: strip leading slash for consistent matching
    path_normalized = path_lower.lstrip('/')
    exclude_dirs = config.get("file_patterns", {}).get("exclude_dirs", EXCLUDED_DIRS)
    for excluded in exclude_dirs:
        excluded_lower = excluded.lower()
        if (f"/{excluded_lower}/" in path_lower or
            path_normalized.startswith(f"{excluded_lower}/") or
            path_normalized == excluded_lower):
            return False

    # Check file extension patterns
    include_patterns = config.get("file_patterns", {}).get("include", [])
    if include_patterns:
        for pattern in include_patterns:
            if re.search(pattern, file_path, re.IGNORECASE):
                return True
        return False

    # Fallback to default pattern
    return bool(FRONTEND_PATTERNS.search(file_path))


def is_port_open(host: str, port: int, timeout_ms: int = 500) -> bool:
    """Quick TCP port check"""
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout_ms / 1000)
        result = sock.connect_ex((host, port))
        return result == 0
    except Exception:
        return False
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass


def detect_dev_server(cwd: str, config: Dict[str, Any]) -> Optional[str]:
    """Detect running dev server URL.

    Args:
        cwd: Working directory (reserved for future package.json detection)
        config: Configuration dict with dev_server settings
    """
    dev_config = config.get("dev_server", {})

    # Check explicit URL first
    explicit_url = dev_config.get("explicit_url")
    if explicit_url:
        return explicit_url

    # Port scan
    ports = dev_config.get("port_scan_range", [3000, 5173, 8080])
    timeout_ms = dev_config.get("connection_timeout_ms", 500)

    for port in ports:
        if is_port_open("localhost", port, timeout_ms):
            log(f"Found dev server on port {port}")
            return f"http://localhost:{port}"

    return None


def load_prompt() -> str:
    """Load UI QA analysis prompt"""
    try:
        if PROMPT_FILE.exists():
            return PROMPT_FILE.read_text(encoding="utf-8")
    except Exception as e:
        log(f"Prompt load error: {e}")

    return "Analyze this UI screenshot for visual issues, layout problems, and accessibility concerns."


def build_qa_instruction(file_path: str, dev_url: str, config: Dict[str, Any]) -> str:
    """Build systemMessage instructing Claude to run UI QA"""
    qa_prompt = load_prompt()
    # Escape prompt for inclusion in instruction
    qa_prompt_escaped = qa_prompt.replace('\n', ' ')[:300]

    screenshot_delay = config.get("qa_settings", {}).get("screenshot_delay_ms", 2000) / 1000

    return f"""[UI-QA] Frontend file modified: `{file_path}`

**Perform visual UI QA using claude-in-chrome MCP tools:**

### Steps:

1. **Get browser tab**:
   ```
   tabs_context_mcp(createIfEmpty=true)
   ```

2. **Navigate to dev server**:
   ```
   navigate(url="{dev_url}", tabId=<tab_id>)
   ```

3. **Wait for render** ({screenshot_delay}s):
   ```
   computer(action="wait", duration={screenshot_delay}, tabId=<tab_id>)
   ```

4. **Take screenshot**:
   ```
   computer(action="screenshot", tabId=<tab_id>)
   ```

5. **Analyze with multimodal-analyzer**:
   ```
   background_task(
     agent="multimodal-analyzer",
     prompt="{qa_prompt_escaped}...",
     description="UI QA analysis"
   )
   ```

6. **Get results**:
   ```
   background_output(task_id=<task_id>, block=true)
   ```

7. **Report findings** to user in structured format.

**Note**: Skip UI QA if dev server is not accessible or screenshot fails."""


def check_debounce(session_id: str, config: Dict[str, Any]) -> bool:
    """Check if we should skip due to debounce or max triggers (returns True if should skip)"""
    auto_config = config.get("auto_trigger", {})
    if not auto_config.get("enabled", True):
        return True

    # Check max triggers per session
    max_triggers = auto_config.get("max_triggers_per_session", 0)
    if max_triggers > 0:
        counter_file = HOOKS_DIR / "logs" / f".ui_qa_counter_{session_id[:8]}"
        try:
            counter_file.parent.mkdir(parents=True, exist_ok=True)
            current_count = 0
            if counter_file.exists():
                current_count = int(counter_file.read_text().strip() or "0")

            if current_count >= max_triggers:
                log(f"Max triggers reached: {current_count}/{max_triggers}")
                return True

            # Increment counter (will be written after debounce check passes)
        except Exception as e:
            log(f"Counter error: {e}")

    debounce_seconds = auto_config.get("debounce_seconds", 5)
    if debounce_seconds <= 0:
        # Still increment counter if max_triggers is set
        _increment_trigger_counter(session_id, config)
        return False

    # Simple file-based debounce
    debounce_file = HOOKS_DIR / "logs" / f".ui_qa_debounce_{session_id[:8]}"
    now = datetime.now().timestamp()

    try:
        if debounce_file.exists():
            last_time = float(debounce_file.read_text())
            if now - last_time < debounce_seconds:
                log(f"Debounce: skipping (last call {now - last_time:.1f}s ago)")
                return True

        debounce_file.parent.mkdir(parents=True, exist_ok=True)
        debounce_file.write_text(str(now))
    except Exception as e:
        log(f"Debounce error: {e}")

    # Increment counter after successful debounce check
    _increment_trigger_counter(session_id, config)

    return False


def _increment_trigger_counter(session_id: str, config: Dict[str, Any]) -> None:
    """Increment the session trigger counter"""
    auto_config = config.get("auto_trigger", {})
    max_triggers = auto_config.get("max_triggers_per_session", 0)
    if max_triggers <= 0:
        return

    counter_file = HOOKS_DIR / "logs" / f".ui_qa_counter_{session_id[:8]}"
    try:
        counter_file.parent.mkdir(parents=True, exist_ok=True)
        current_count = 0
        if counter_file.exists():
            current_count = int(counter_file.read_text().strip() or "0")
        counter_file.write_text(str(current_count + 1))
        log(f"Trigger count: {current_count + 1}/{max_triggers}")
    except Exception as e:
        log(f"Counter increment error: {e}")


def main():
    """Main entrypoint"""
    log("ui_qa_wrapper.py executed")

    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"continue": True}))
            return

        hook_input = json.loads(input_data)
    except Exception as e:
        log(f"Input error: {e}")
        print(json.dumps({"continue": True}))
        return

    config = load_config()

    # Check if enabled
    if not config.get("enabled", False):
        log("UI QA disabled in config")
        print(json.dumps({"continue": True}))
        return

    # Extract file path and session info
    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path", "")
    cwd = hook_input.get("cwd", "")
    session_id = hook_input.get("session_id", "unknown")

    # Check if frontend file
    if not is_frontend_file(file_path, config):
        log(f"Not a frontend file: {file_path}")
        print(json.dumps({"continue": True}))
        return

    # Check debounce
    if check_debounce(session_id, config):
        print(json.dumps({"continue": True}))
        return

    # Detect dev server
    dev_url = detect_dev_server(cwd, config)
    if not dev_url:
        log("No dev server detected")
        print(json.dumps({
            "continue": True,
            "systemMessage": f"[UI-QA] Modified `{file_path}` but no dev server detected on common ports. Start your dev server or set explicit_url in ui_qa_config.json for UI QA."
        }))
        return

    # Build UI QA instruction
    instruction = build_qa_instruction(file_path, dev_url, config)
    log(f"Triggering UI QA for {file_path} at {dev_url}")

    print(json.dumps({
        "continue": True,
        "systemMessage": instruction
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
