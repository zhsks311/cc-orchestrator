#!/usr/bin/env python3
"""
Completion Review Orchestrator
Runs Claude self-review + external LLM review when all TODOs are completed

Usage:
    echo '{"session_id": "...", "tool_input": {"todos": [...]}, ...}' | python completion_orchestrator.py
"""
import sys
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Add module path
sys.path.insert(0, str(Path(__file__).parent))

from adapters import GeminiAdapter, CopilotAdapter, ReviewResult
from adapters.base import Severity
from adapters.claude_self import ClaudeSelfAdapter
from state_manager import get_state_manager
from security import get_security_validator, load_config
from todo_state_detector import TodoStateDetector
from intent_extractor import IntentExtractor
from quota_monitor import get_quota_monitor
from debate_orchestrator import DebateOrchestrator


class AuditLogger:
    """Audit log recording"""

    def __init__(self, log_dir: str = "~/.claude/hooks/logs"):
        self.log_dir = Path(log_dir).expanduser()
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def log(self, event: Dict[str, Any]):
        today = datetime.now().strftime("%Y-%m-%d")
        log_file = self.log_dir / f"completion-audit-{today}.jsonl"

        event["timestamp"] = datetime.now().isoformat()

        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")


class CompletionOrchestrator:
    """Completion review orchestrator"""

    def __init__(self):
        self.config = load_config()
        self.state_manager = get_state_manager()
        self.security = get_security_validator()
        self.audit_logger = AuditLogger()
        self.todo_detector = TodoStateDetector(self.state_manager)
        self.intent_extractor = IntentExtractor()
        self.quota_monitor = get_quota_monitor()
        self.debate_orchestrator = DebateOrchestrator(self.config)

        # Initialize adapters
        self.self_adapter = ClaudeSelfAdapter(self.config)
        self.external_adapters = self._init_external_adapters()

    def _init_external_adapters(self) -> List:
        """Initialize external LLM adapters (with quota check)"""
        adapters = []
        completion_config = self.config.get("completion_review", {})

        if not completion_config.get("include_external_review", True):
            return adapters

        enabled = self.config.get("enabled_adapters", ["gemini", "copilot"])
        # Filter only adapters with available quota
        available = self.quota_monitor.get_available_adapters(enabled)

        if "gemini" in available:
            adapter = GeminiAdapter(self.config)
            if adapter.is_available():
                adapters.append(adapter)

        if "copilot" in available:
            adapter = CopilotAdapter(self.config)
            if adapter.is_available():
                adapters.append(adapter)

        return adapters

    def _build_context(self, hook_input: Dict[str, Any], todos: List[Dict]) -> Dict[str, Any]:
        """Build context"""
        transcript_path = hook_input.get("transcript_path")

        # Extract intent
        intent_info = {}
        if transcript_path:
            intent_info = self.intent_extractor.extract_from_transcript(transcript_path)

        return {
            "session_id": hook_input.get("session_id", "unknown"),
            "todos": todos,
            "combined_intent": intent_info.get("combined_intent", ""),
            "original_request": intent_info.get("original_request", ""),
            "message_count": intent_info.get("message_count", 0),
            "cwd": hook_input.get("cwd", "")
        }

    def _load_prompt(self, prompt_name: str) -> str:
        """Load prompt"""
        prompt_path = Path("~/.claude/hooks/prompts").expanduser() / f"{prompt_name}.txt"
        if prompt_path.exists():
            return prompt_path.read_text(encoding="utf-8")

        # Default prompt
        return """You are a senior software architect.
Review the completion status and verify the following:
1. Have all user requests been implemented?
2. Are there any missing features or requirements?
3. Were any unnecessary features added that weren't requested?

Please respond in JSON format:
{
  "severity": "OK|LOW|MEDIUM|HIGH|CRITICAL",
  "issues": [{"description": "...", "severity": "...", "suggestion": "..."}]
}"""

    def _run_parallel_reviews(self, context: Dict[str, Any]) -> List[ReviewResult]:
        """Run reviews in parallel (with quota monitoring)"""
        results = []
        completion_config = self.config.get("completion_review", {})

        # Self review (using sub-agent)
        if completion_config.get("include_self_review", True):
            self_result = self.self_adapter.review("", context)
            results.append(self_result)

        # External LLM review (quota checked)
        # Re-initialize adapters on each call (reflect quota status)
        self.external_adapters = self._init_external_adapters()

        if self.external_adapters:
            prompt = self._load_prompt("completion_external")

            full_prompt = f"""{prompt}

## Original User Request:
{context.get("combined_intent", "N/A")}

## Completed Task List:
{self._format_todos(context.get("todos", []))}
"""

            with ThreadPoolExecutor(max_workers=len(self.external_adapters)) as executor:
                futures = {
                    executor.submit(adapter.review, full_prompt, context): adapter
                    for adapter in self.external_adapters
                }
                for future in as_completed(futures):
                    adapter = futures[future]
                    try:
                        result = future.result()
                        # Quota monitoring: record success/failure
                        if result.success:
                            self.quota_monitor.record_success(adapter.name)
                        else:
                            self.quota_monitor.record_failure(adapter.name, result.error or "Unknown error")
                        results.append(result)
                    except Exception as e:
                        self.quota_monitor.record_failure(adapter.name, str(e))
                        results.append(ReviewResult(
                            adapter_name=adapter.name,
                            severity=Severity.OK,
                            issues=[],
                            raw_response="",
                            success=False,
                            error=str(e)
                        ))

        return results

    def _format_todos(self, todos: List[Dict]) -> str:
        """Format todo list"""
        if not todos:
            return "(None)"

        lines = []
        for i, todo in enumerate(todos, 1):
            content = todo.get("content", "")
            status = todo.get("status", "")
            status_icon = "✅" if status == "completed" else "⏳"
            lines.append(f"{i}. {status_icon} {content}")

        return "\n".join(lines)

    def _build_output(
        self,
        results: List[ReviewResult],
        context: Dict[str, Any],
        debate_result: Optional['DebateRound'] = None
    ) -> Dict[str, Any]:
        """Generate output (conditional block logic)"""
        from debate_orchestrator import DebateRound  # For type hint

        messages = []

        # Self review message (request review from Claude)
        for r in results:
            if r.is_self_review:
                messages.append(r.raw_response)

        # External LLM results
        external_results = [r for r in results if not r.is_self_review and r.success]
        final_severity = Severity.OK

        # If debate occurred, use debate result's severity
        if debate_result and debate_result.final_severity:
            final_severity = debate_result.final_severity
            messages.append(self.debate_orchestrator.format_debate_result(debate_result))
        elif external_results:
            final_severity = max((r.severity for r in external_results), default=Severity.OK)

            if final_severity != Severity.OK:
                messages.append(f"\n### External LLM Review Result ({final_severity.value}):")
                for r in external_results:
                    if r.issues:
                        messages.append(f"\n**{r.adapter_name}**:")
                        for issue in r.issues:
                            messages.append(f"- [{issue.severity.value}] {issue.description}")
                            if issue.suggestion:
                                messages.append(f"  → Suggestion: {issue.suggestion}")

        # Conditional block: Only CRITICAL blocks, others just warn
        should_block = final_severity == Severity.CRITICAL

        if should_block:
            messages.append("\n⛔ **CRITICAL issue found**: Task blocked. Please resolve the above issues and try again.")

        return {
            "continue": not should_block,
            "systemMessage": "\n".join(messages)
        }

    def orchestrate(self, hook_input: Dict[str, Any]) -> Dict[str, Any]:
        """Main orchestration"""
        session_id = hook_input.get("session_id", "unknown")
        todos = hook_input.get("tool_input", {}).get("todos", [])

        # 1. Check completion status
        todo_state = self.todo_detector.detect_completion(session_id, todos)

        if not todo_state.just_completed:
            # Skip if not just completed
            return {"continue": True, "systemMessage": ""}

        # 2. Check review count (prevent infinite loop)
        completion_config = self.config.get("completion_review", {})
        max_reviews = completion_config.get("max_reviews", 3)
        review_count = self.state_manager.get_completion_review_count(session_id)

        if review_count >= max_reviews:
            self.audit_logger.log({
                "event_type": "max_reviews_reached",
                "session_id": session_id,
                "review_count": review_count
            })
            return {
                "continue": True,
                "systemMessage": f"[Completion Review] Max review count ({max_reviews}) reached. Proceeding."
            }

        self.state_manager.increment_completion_review_count(session_id)

        # 3. Build context
        context = self._build_context(hook_input, todos)

        # 4. Run parallel reviews
        results = self._run_parallel_reviews(context)

        # 4.5. Check if debate is needed and run
        debate_result = None
        external_results = [r for r in results if not r.is_self_review and r.success]

        if external_results:
            needs_debate, reason = self.debate_orchestrator.needs_debate(external_results)

            if needs_debate:
                # Run debate
                debate_result = self.debate_orchestrator.run_debate(
                    adapters=self.external_adapters,
                    initial_results=external_results,
                    original_prompt=self._load_prompt("completion_external"),
                    context=context
                )

                # Replace external LLM results with debate results
                self_results = [r for r in results if r.is_self_review]
                results = self_results + debate_result.results

        # 5. Audit log (including quota status + debate info)
        audit_data = {
            "event_type": "completion_review",
            "session_id": session_id,
            "review_count": review_count + 1,
            "todo_count": len(todos),
            "intent_length": len(context.get("combined_intent", "")),
            "llm_results": [r.to_dict() for r in results if not r.is_self_review],
            "quota_status": self.quota_monitor.get_summary()
        }

        if debate_result:
            audit_data["debate"] = {
                "triggered": True,
                "reason": reason,
                "rounds": debate_result.round_num,
                "consensus_reached": debate_result.consensus_reached,
                "final_severity": debate_result.final_severity.value if debate_result.final_severity else None
            }

        self.audit_logger.log(audit_data)

        # 6. Generate output
        return self._build_output(results, context, debate_result)


def main():
    """CLI entrypoint"""
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        print(json.dumps({
            "continue": True,
            "systemMessage": "[Completion Review] Input parsing failed"
        }))
        sys.exit(0)

    orchestrator = CompletionOrchestrator()
    result = orchestrator.orchestrate(input_data)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
