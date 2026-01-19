"""
Claude Self Review Adapter
Guide Claude to self-review through systemMessage

v2: Uses Task subagent by default
- Performs independent code review via code-reviewer subagent
- Reviews from a perspective separate from main Claude
"""
from typing import Dict, Any, List

from .base import LLMAdapter, ReviewResult, Severity, Issue


class ClaudeSelfAdapter(LLMAdapter):
    """
    Claude Self Review Adapter v2

    Features:
    - Uses Task subagent (code-reviewer)
    - Code review from perspective independent of main session
    - Free, no quota limits
    """

    def __init__(self, config: Dict[str, Any]):
        super().__init__("claude_self", config)
        self.use_subagent = config.get("completion_review", {}).get("use_subagent", True)

    def is_available(self) -> bool:
        """Always available"""
        return True

    def review(self, prompt: str, context: Dict[str, Any]) -> ReviewResult:
        """
        Generate self review message

        Note: Does not perform actual review, only generates message requesting Claude to review
        """
        message = self._build_self_review_message(context)

        return ReviewResult(
            adapter_name=self.name,
            severity=Severity.OK,  # Self review doesn't judge severity
            issues=[],
            raw_response=message,
            success=True,
            is_self_review=True
        )

    def _build_self_review_message(self, context: Dict[str, Any]) -> str:
        """Generate self review request message"""
        todos = context.get("todos", [])
        combined_intent = context.get("combined_intent", "")
        original_request = context.get("original_request", "")
        cwd = context.get("cwd", "")

        todos_formatted = self._format_todos(todos)

        # Use summary if original request is too long
        intent_display = combined_intent if combined_intent else original_request
        if len(intent_display) > 3000:
            intent_display = intent_display[:3000] + "\n\n[...truncated...]"

        if self.use_subagent:
            return self._build_subagent_review_message(
                intent_display, todos_formatted, cwd
            )
        else:
            return self._build_simple_review_message(
                intent_display, todos_formatted
            )

    def _build_subagent_review_message(
        self, intent: str, todos: str, cwd: str
    ) -> str:
        """Generate review request message using subagent"""
        return f"""## Task Complete - Subagent Code Review Request

All TODOs have been completed. **Run code-reviewer subagent via Task tool** to review code from an independent perspective.

### How to Execute:
Use Task tool to run code-reviewer agent as follows:

```
subagent_type: "pr-review-toolkit:code-reviewer"
prompt: |
  Please perform code review for the following task.

  ## User Request:
  {intent[:1500]}

  ## Completed Tasks:
  {todos}

  ## Working Directory: {cwd}

  Check recently changed files with git diff and review them.
```

### Post-Review Actions:
- **CRITICAL/HIGH issues**: Fix immediately
- **MEDIUM issues**: Recommended fix, user discretion
- **LOW issues**: For reference

Please proceed with necessary fixes based on subagent review results."""

    def _build_simple_review_message(self, intent: str, todos: str) -> str:
        """Structured checklist-based self review (v3)"""
        return f"""## Task Complete - Structured Self Review

All TODOs have been completed. **Review each item in the checklist below** and fix immediately if issues are found.

### Original User Request:
{intent}

### Completed Tasks:
{todos}

---

## Required Checklist (explicitly verify each item)

### 1. Requirements Fulfillment
- [ ] Are **all features** the user requested implemented?
- [ ] Were no **unnecessary features** added that weren't requested?
- [ ] Are implicitly expected **edge cases** handled?

### 2. Security (OWASP Top 10)
- [ ] **SQL Injection**: Is user input not directly included in queries?
- [ ] **XSS**: Is user input not output to HTML without escaping?
- [ ] **Command Injection**: Is user input not included in shell commands?
- [ ] **Secrets**: Are API keys and passwords not hardcoded?

### 3. Error Handling
- [ ] Is **timeout** set for external API calls?
- [ ] Is **exception handling** present for file/network operations?
- [ ] Do error messages **not expose sensitive info**?

### 4. Testability
- [ ] Is the code written in a **testable structure**?
- [ ] If tests were requested, were **tests actually run**?

### 5. Code Quality
- [ ] Is there no **duplicate code**?
- [ ] Do variable/function names **express clear intent**?
- [ ] Are there no leftover **comments or debug code**?

---

## Review Result Report

After reviewing the checklist above, report in the following format:

```
Passed: [passed count]/[total count]
Issues Found: [list if any]
Fixes Needed: [proceed with fix immediately if any]
```

**If issues are found, don't just report - proceed with fixes immediately.**"""

    def _format_todos(self, todos: List[Dict[str, Any]]) -> str:
        """Format todo list"""
        if not todos:
            return "(none)"

        lines = []
        for i, todo in enumerate(todos, 1):
            content = todo.get("content", "")
            status = todo.get("status", "")
            status_icon = "✅" if status == "completed" else "⏳"
            lines.append(f"{i}. {status_icon} {content}")

        return "\n".join(lines)
