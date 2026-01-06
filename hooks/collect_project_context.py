#!/usr/bin/env python3
"""Project context collector"""
import sys
import json
import subprocess
import re
from datetime import datetime
from pathlib import Path

def get_command_output(cmd: list) -> str:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5,
                                shell=(sys.platform == 'win32'))
        return result.stdout.strip() if result.returncode == 0 else ""
    except Exception:
        return ""

def main():
    project_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    project_path = Path(project_dir).resolve()

    if not project_path.exists():
        print(json.dumps({"error": "Project directory not found"}))
        return

    context = {}

    java_out = get_command_output(["java", "-version"])
    if java_out:
        match = re.search(r'"([^"]+)"', java_out)
        if match:
            context["java_version"] = match.group(1)

    if (project_path / "pyproject.toml").exists() or (project_path / "requirements.txt").exists():
        py_ver = get_command_output(["python", "--version"])
        if py_ver:
            context["python_version"] = py_ver.replace("Python ", "")

    if (project_path / "package.json").exists():
        node_ver = get_command_output(["node", "--version"])
        if node_ver:
            context["node_version"] = node_ver

    if (project_path / "src" / "main" / "java").exists():
        context["project_structure"] = "java-maven-gradle"
    elif (project_path / "app").exists() and (project_path / "package.json").exists():
        context["project_structure"] = "nextjs-or-node"
    elif (project_path / "src").exists() and (project_path / "package.json").exists():
        context["project_structure"] = "typescript-or-react"
    else:
        context["project_structure"] = "unknown"

    context["collected_at"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    print(json.dumps(context, indent=2))

if __name__ == "__main__":
    main()
