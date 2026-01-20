"""
GitHub Copilot CLI Adapter
"""
import subprocess
import time
import shutil
import tempfile
from pathlib import Path
from typing import Dict, Any

from .base import LLMAdapter, ReviewResult, Severity


class CopilotAdapter(LLMAdapter):
    """Review adapter using GitHub Copilot CLI"""

    def __init__(self, config: Dict[str, Any]):
        super().__init__("copilot", config)
        # Search for copilot CLI path
        self.cli_path = shutil.which("copilot")

    def is_available(self) -> bool:
        return self.cli_path is not None

    def review(self, prompt: str, context: Dict[str, Any]) -> ReviewResult:
        if not self.is_available():
            return ReviewResult(
                adapter_name=self.name,
                severity=Severity.OK,
                issues=[],
                raw_response="",
                success=False,
                error="Copilot CLI not found"
            )

        start_time = time.time()

        try:
            # Include context in prompt
            full_prompt = self._build_prompt(prompt, context)

            # Copilot CLI doesn't accept stdin directly, so use temp file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                f.write(full_prompt)
                temp_path = f.name

            try:
                # Call Copilot CLI (reference temp file containing the full prompt)
                result = subprocess.run(
                    [self.cli_path, "-p", f"Please review the contents of this file: {temp_path}"],
                    capture_output=True,
                    text=True,
                    timeout=self.timeout
                )
            finally:
                Path(temp_path).unlink(missing_ok=True)

            duration_ms = int((time.time() - start_time) * 1000)

            if result.returncode != 0:
                return ReviewResult(
                    adapter_name=self.name,
                    severity=Severity.OK,
                    issues=[],
                    raw_response=result.stderr,
                    success=False,
                    error=f"CLI error: {result.stderr}",
                    duration_ms=duration_ms
                )

            # Parse response
            review_result = self.parse_response(result.stdout)
            review_result.duration_ms = duration_ms
            return review_result

        except subprocess.TimeoutExpired:
            return ReviewResult(
                adapter_name=self.name,
                severity=Severity.OK,
                issues=[],
                raw_response="",
                success=False,
                error=f"Timeout after {self.timeout}s",
                duration_ms=int((time.time() - start_time) * 1000)
            )
        except Exception as e:
            return ReviewResult(
                adapter_name=self.name,
                severity=Severity.OK,
                issues=[],
                raw_response="",
                success=False,
                error=str(e),
                duration_ms=int((time.time() - start_time) * 1000)
            )

    def _build_prompt(self, base_prompt: str, context: Dict[str, Any]) -> str:
        """Generate prompt with context info"""
        parts = [base_prompt]

        if context.get("file_path"):
            parts.append(f"\n## File Path\n{context['file_path']}")

        if context.get("diff"):
            parts.append(f"\n## Changes\n```\n{context['diff']}\n```")

        if context.get("code"):
            parts.append(f"\n## Code\n```\n{context['code']}\n```")

        if context.get("user_request"):
            parts.append(f"\n## User Request\n{context['user_request']}")

        parts.append("""
## Response Format
You must respond in the following JSON format:
```json
{
  "severity": "OK|LOW|MEDIUM|HIGH|CRITICAL",
  "issues": [
    {
      "description": "Issue description",
      "severity": "OK|LOW|MEDIUM|HIGH|CRITICAL",
      "location": "file:line (optional)",
      "suggestion": "Fix suggestion (optional)"
    }
  ]
}
```
""")

        return "\n".join(parts)
