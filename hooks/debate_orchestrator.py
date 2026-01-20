"""
LLM Debate Orchestrator
Reach consensus through debate when disagreements occur

How it works:
1. Round 1: Each LLM reviews independently
2. Check conditions: Disagreement or HIGH+ severity found
3. Round 2: Share other opinions -> Re-evaluate
4. Reach consensus or weighted voting
"""
import json
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass

from adapters.base import LLMAdapter, ReviewResult, Severity, Issue


@dataclass
class DebateRound:
    """Debate round result"""
    round_num: int
    results: List[ReviewResult]
    consensus_reached: bool
    final_severity: Optional[Severity] = None


class DebateOrchestrator:
    """LLM debate orchestrator"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        debate_config = config.get("debate", {})
        self.enabled = debate_config.get("enabled", False)
        self.max_rounds = debate_config.get("max_rounds", 2)
        self.trigger_on_disagreement = debate_config.get("trigger_on_disagreement", True)
        self.trigger_on_high = debate_config.get("trigger_on_high_severity", True)

    def needs_debate(self, results: List[ReviewResult]) -> Tuple[bool, str]:
        """Determine if debate is needed"""
        if not self.enabled:
            return False, "debate disabled"

        successful = [r for r in results if r.success and not r.is_self_review]
        if len(successful) < 1:
            return False, "not enough results"

        severities = [r.severity for r in successful]

        # Condition 1: HIGH+ severity found
        if self.trigger_on_high:
            if any(s in [Severity.HIGH, Severity.CRITICAL] for s in severities):
                return True, "high severity found"

        # Condition 2: Severity disagreement (when 2+ results exist)
        if self.trigger_on_disagreement and len(severities) >= 2:
            severity_levels = set(severities)
            if len(severity_levels) > 1:
                # 2+ level difference (e.g., OK vs HIGH)
                ordered = [Severity.OK, Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
                indices = [ordered.index(s) for s in severities]
                if max(indices) - min(indices) >= 2:
                    return True, "significant disagreement"

        return False, "no debate needed"

    def build_debate_prompt(
        self,
        original_prompt: str,
        other_results: List[ReviewResult],
        round_num: int
    ) -> str:
        """Build debate prompt"""
        others_opinion = self._format_others_opinions(other_results)

        return f"""## Code Review Debate - Round {round_num}

Review other reviewers' opinions and make your final judgment.

### Other Reviewers' Opinions:
{others_opinion}

### Original Review Request:
{original_prompt}

### Instructions:
1. Carefully review other reviewers' opinions
2. If you agree, explain why; if you disagree, provide evidence
3. Determine the final severity and issue list
4. Add any new issues you discover

### Response Format:
```json
{{
  "severity": "OK|LOW|MEDIUM|HIGH|CRITICAL",
  "agree_with_others": true/false,
  "reasoning": "Reason for agreement/disagreement",
  "issues": [
    {{
      "description": "Issue description",
      "severity": "...",
      "suggestion": "Fix suggestion"
    }}
  ]
}}
```
"""

    def _format_others_opinions(self, results: List[ReviewResult]) -> str:
        """Format other reviewers' opinions"""
        parts = []
        for r in results:
            parts.append(f"**{r.adapter_name}** (Severity: {r.severity.value}):")
            if r.issues:
                for issue in r.issues:
                    parts.append(f"  - [{issue.severity.value}] {issue.description}")
                    if issue.suggestion:
                        parts.append(f"    → Suggestion: {issue.suggestion}")
            else:
                parts.append("  (No issues)")
            parts.append("")
        return "\n".join(parts)

    def run_debate(
        self,
        adapters: List[LLMAdapter],
        initial_results: List[ReviewResult],
        original_prompt: str,
        context: Dict[str, Any]
    ) -> DebateRound:
        """Run debate"""
        current_results = initial_results.copy()

        for round_num in range(2, self.max_rounds + 2):  # Start from round 2
            new_results = []

            for adapter in adapters:
                # Show results from other adapters
                other_results = [r for r in current_results if r.adapter_name != adapter.name]

                if not other_results:
                    continue

                debate_prompt = self.build_debate_prompt(
                    original_prompt, other_results, round_num
                )

                result = adapter.review(debate_prompt, context)
                new_results.append(result)

            if not new_results:
                break

            current_results = new_results

            # Check consensus
            consensus, final_severity = self._check_consensus(current_results)
            if consensus:
                return DebateRound(
                    round_num=round_num,
                    results=current_results,
                    consensus_reached=True,
                    final_severity=final_severity
                )

        # Consensus failed -> weighted voting
        final_severity = self._weighted_vote(current_results)
        return DebateRound(
            round_num=self.max_rounds + 1,
            results=current_results,
            consensus_reached=False,
            final_severity=final_severity
        )

    def _check_consensus(self, results: List[ReviewResult]) -> Tuple[bool, Optional[Severity]]:
        """Check consensus"""
        successful = [r for r in results if r.success]
        if not successful:
            return False, None

        severities = [r.severity for r in successful]
        unique = set(severities)

        # Consensus if all have same severity
        if len(unique) == 1:
            return True, severities[0]

        # Consider consensus if difference is within 1 level (e.g., LOW and MEDIUM)
        ordered = [Severity.OK, Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
        indices = [ordered.index(s) for s in severities]
        if max(indices) - min(indices) <= 1:
            # Consensus to the higher level
            return True, ordered[max(indices)]

        return False, None

    def _weighted_vote(self, results: List[ReviewResult]) -> Severity:
        """Final decision by weighted voting"""
        weights = self.config.get("conflict_resolution", {}).get("weights", {})

        severity_scores = {
            Severity.OK: 0,
            Severity.LOW: 1,
            Severity.MEDIUM: 2,
            Severity.HIGH: 3,
            Severity.CRITICAL: 4
        }

        total_weight = 0
        weighted_score = 0

        for r in results:
            if not r.success:
                continue
            weight = weights.get(r.adapter_name, 1.0)
            score = severity_scores.get(r.severity, 0)
            weighted_score += weight * score
            total_weight += weight

        if total_weight == 0:
            return Severity.OK

        avg_score = weighted_score / total_weight

        # Round to determine severity
        score_to_severity = {v: k for k, v in severity_scores.items()}
        rounded_score = round(avg_score)
        return score_to_severity.get(rounded_score, Severity.MEDIUM)

    def format_debate_result(self, debate_round: DebateRound) -> str:
        """Format debate result"""
        parts = [
            f"\n### 🗣️ LLM Debate Result (Round {debate_round.round_num})",
            f"Consensus reached: {'✅ Yes' if debate_round.consensus_reached else '❌ No (weighted voting)'}",
            f"Final Severity: **{debate_round.final_severity.value}**",
            ""
        ]

        for r in debate_round.results:
            if r.success:
                parts.append(f"**{r.adapter_name}**: {r.severity.value}")
                if r.issues:
                    for issue in r.issues[:3]:  # Max 3
                        parts.append(f"  - {issue.description}")

        return "\n".join(parts)
