#!/usr/bin/env python3
"""
Review Orchestrator - Parallel LLM calls and result aggregation

Usage:
    echo '{"stage": "code", "context": {...}}' | python review_orchestrator.py

stdin input (from Claude Code Hook):
{
    "session_id": "abc123",
    "tool_name": "Edit",
    "tool_input": {...},
    "transcript_path": "/path/to/transcript.json",
    "cwd": "/project/root"
}
"""
import sys
import json
import os
from pathlib import Path
from typing import Dict, Any, List
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Add module path
sys.path.insert(0, str(Path(__file__).parent))

from adapters import GeminiAdapter, CopilotAdapter, ReviewResult
from adapters.base import Severity
from state_manager import get_state_manager
from security import get_security_validator, load_config


class AuditLogger:
    """Audit log recording"""

    def __init__(self, log_dir: str = "~/.claude/hooks/logs"):
        self.log_dir = Path(log_dir).expanduser()
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def log(self, event: Dict[str, Any]):
        today = datetime.now().strftime("%Y-%m-%d")
        log_file = self.log_dir / f"audit-{today}.jsonl"

        event["timestamp"] = datetime.now().isoformat()

        with open(log_file, "a") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")


class ReviewOrchestrator:
    """Multi-LLM review orchestrator"""

    def __init__(self):
        self.config = load_config()
        self.state_manager = get_state_manager()
        self.security = get_security_validator()
        self.audit_logger = AuditLogger()

        # Initialize adapters
        self.adapters = []
        enabled = self.config.get("enabled_adapters", ["gemini", "copilot"])

        if "gemini" in enabled:
            adapter = GeminiAdapter(self.config)
            if adapter.is_available():
                self.adapters.append(adapter)

        if "copilot" in enabled:
            adapter = CopilotAdapter(self.config)
            if adapter.is_available():
                self.adapters.append(adapter)

    def extract_context(self, hook_input: Dict[str, Any]) -> Dict[str, Any]:
        """Extract dynamic context from hook input"""
        context = {
            "session_id": hook_input.get("session_id", "unknown"),
            "tool_name": hook_input.get("tool_name", ""),
            "cwd": hook_input.get("cwd", ""),
        }

        tool_input = hook_input.get("tool_input", {})

        # Edit tool: extract diff
        if "old_string" in tool_input and "new_string" in tool_input:
            context["file_path"] = tool_input.get("file_path", "")
            context["diff"] = f"- {tool_input['old_string']}\n+ {tool_input['new_string']}"
            context["code"] = tool_input.get("new_string", "")

        # Write tool: full content
        elif "content" in tool_input:
            context["file_path"] = tool_input.get("file_path", "")
            context["code"] = tool_input.get("content", "")

        # TodoWrite tool: extract plan
        elif "todos" in tool_input:
            context["todos"] = tool_input.get("todos", [])

        # Mask sensitive info
        if context.get("code"):
            context["code"] = self.security.mask_sensitive_data(context["code"])
        if context.get("diff"):
            context["diff"] = self.security.mask_sensitive_data(context["diff"])

        return context

    def load_prompt(self, stage: str) -> str:
        """Load stage-specific prompt"""
        prompt_path = Path("~/.claude/hooks/prompts").expanduser() / f"{stage}.txt"
        if prompt_path.exists():
            return prompt_path.read_text()

        # Default prompts
        default_prompts = {
            "plan": "You are a senior developer. Review the task plan below and identify unnecessary work (YAGNI), missing items, and potential issues.",
            "code": "You are a senior code reviewer. Review the code changes below and identify bugs, security vulnerabilities, and code quality issues.",
            "test": "You are a QA expert. Analyze the test results below and check for additional tests needed and missing cases.",
            "final": "You are a senior architect. Comprehensively review the entire work and evaluate the final quality."
        }
        return default_prompts.get(stage, default_prompts["code"])

    def resolve_conflict(self, results: List[ReviewResult]) -> Severity:
        """Resolve LLM opinion conflicts"""
        conflict_config = self.config.get("conflict_resolution", {})
        policy = conflict_config.get("policy", "conservative")

        severities = [r.severity for r in results if r.success]

        if not severities:
            return Severity.OK

        if policy == "conservative" or policy == "highest_severity":
            # Select highest severity
            return max(severities)

        elif policy == "majority_vote":
            # Majority vote (highest severity on tie)
            from collections import Counter
            counts = Counter(severities)
            max_count = max(counts.values())
            candidates = [s for s, c in counts.items() if c == max_count]
            return max(candidates)

        elif policy == "weighted_vote":
            # Apply weights
            weights = conflict_config.get("weights", {})
            weighted_scores = {}
            for result in results:
                if result.success:
                    weight = weights.get(result.adapter_name, 1.0)
                    severity_score = list(Severity).index(result.severity)
                    weighted_scores[result.adapter_name] = severity_score * weight

            if weighted_scores:
                max_adapter = max(weighted_scores, key=weighted_scores.get)
                for result in results:
                    if result.adapter_name == max_adapter:
                        return result.severity

        return max(severities) if severities else Severity.OK

    def run_parallel_reviews(self, prompt: str, context: Dict[str, Any]) -> List[ReviewResult]:
        """Run LLM reviews in parallel"""
        results = []

        if not self.adapters:
            return results

        parallel = self.config.get("parallel_execution", True)

        if parallel and len(self.adapters) > 1:
            with ThreadPoolExecutor(max_workers=len(self.adapters)) as executor:
                futures = {
                    executor.submit(adapter.review, prompt, context): adapter
                    for adapter in self.adapters
                }
                for future in as_completed(futures):
                    try:
                        result = future.result()
                        results.append(result)
                    except Exception as e:
                        adapter = futures[future]
                        results.append(ReviewResult(
                            adapter_name=adapter.name,
                            severity=Severity.OK,
                            issues=[],
                            raw_response="",
                            success=False,
                            error=str(e)
                        ))
        else:
            for adapter in self.adapters:
                try:
                    result = adapter.review(prompt, context)
                    results.append(result)
                except Exception as e:
                    results.append(ReviewResult(
                        adapter_name=adapter.name,
                        severity=Severity.OK,
                        issues=[],
                        raw_response="",
                        success=False,
                        error=str(e)
                    ))

        return results

    def check_override(self, session_id: str) -> bool:
        """Check override"""
        override_config = self.config.get("override", {})
        if not override_config.get("enabled", True):
            return False

        # Check environment variable
        if os.environ.get("CLAUDE_SKIP_REVIEW") == "1":
            return True

        # Check state
        return self.state_manager.check_and_consume_override(session_id)

    def check_debounce(self, session_id: str, stage: str) -> bool:
        """Debounce check - True means should skip"""
        debounce_config = self.config.get("debounce", {})
        if not debounce_config.get("enabled", True):
            return False

        if stage not in debounce_config.get("stages", ["code"]):
            return False

        seconds = debounce_config.get("seconds", 3)
        return self.state_manager.should_debounce(session_id, stage, seconds)

    def build_system_message(self, results: List[ReviewResult], final_severity: Severity, stage: str) -> str:
        """Generate system message for Claude"""
        if final_severity == Severity.OK:
            return f"[Self-Review-{stage}] ✅ Review passed"

        messages = [f"[Self-Review-{stage}] ⚠️ {final_severity.value} level issues found:"]

        for result in results:
            if result.success and result.issues:
                messages.append(f"\n### {result.adapter_name} Feedback:")
                for issue in result.issues:
                    messages.append(f"- [{issue.severity.value}] {issue.description}")
                    if issue.suggestion:
                        messages.append(f"  → Suggestion: {issue.suggestion}")

        if final_severity in [Severity.CRITICAL, Severity.HIGH]:
            messages.append("\n⚠️ Please fix the above issues.")

        return "\n".join(messages)

    def orchestrate(self, stage: str, hook_input: Dict[str, Any]) -> Dict[str, Any]:
        """Main orchestration logic"""
        context = self.extract_context(hook_input)
        session_id = context["session_id"]

        # Override check
        if self.check_override(session_id):
            self.audit_logger.log({
                "event_type": "override",
                "session_id": session_id,
                "stage": stage
            })
            return {
                "decision": "continue",
                "systemMessage": f"[Self-Review-{stage}] 🔓 Skipped by override"
            }

        # Debounce check
        if self.check_debounce(session_id, stage):
            return {
                "decision": "continue",
                "systemMessage": ""  # No message on debounce
            }

        # Update debounce time
        self.state_manager.update_last_call_time(session_id, stage)

        # Load prompt and run review
        prompt = self.load_prompt(stage)
        results = self.run_parallel_reviews(prompt, context)

        # Resolve conflicts
        final_severity = self.resolve_conflict(results)

        # Generate system message
        system_message = self.build_system_message(results, final_severity, stage)

        # Retry logic
        rework_config = self.config.get("rework_settings", {})
        stage_config = self.config.get("stage_settings", {}).get(stage, {})
        max_retries = stage_config.get("max_retries", rework_config.get("max_retries", 3))

        should_continue = True
        if final_severity in [Severity.CRITICAL, Severity.HIGH]:
            retry_count = self.state_manager.get_retry_count(session_id, stage)
            if retry_count < max_retries:
                self.state_manager.increment_retry_count(session_id, stage)
                should_continue = False
                system_message += f"\n\n(Retry {retry_count + 1}/{max_retries})"
            else:
                system_message += f"\n\n⚠️ Max retry count ({max_retries}) reached. Proceeding with warning."

        # Audit log
        self.audit_logger.log({
            "event_type": "review",
            "session_id": session_id,
            "stage": stage,
            "llm_results": [r.to_dict() for r in results],
            "final_severity": final_severity.value,
            "continue_decision": should_continue
        })

        return {
            "decision": "continue" if should_continue else "block",
            "systemMessage": system_message
        }


def main():
    """CLI entrypoint"""
    # Read input from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        print(json.dumps({
            "decision": "continue",
            "systemMessage": "[Self-Review] ⚠️ Input parsing failed"
        }))
        sys.exit(0)

    stage = input_data.get("stage", "code")
    hook_input = input_data.get("hook_input", input_data)

    orchestrator = ReviewOrchestrator()
    result = orchestrator.orchestrate(stage, hook_input)

    # Output in Claude Code Hook format
    output = {}
    if result.get("systemMessage"):
        output["systemMessage"] = result["systemMessage"]

    if result.get("decision") == "block":
        output["continue"] = False
    else:
        output["continue"] = True

    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
