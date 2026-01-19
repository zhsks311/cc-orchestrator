"""
LLM Adapter Base Class
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional, Dict, Any
from enum import Enum


class Severity(Enum):
    OK = "OK"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

    @classmethod
    def from_string(cls, value: str) -> "Severity":
        try:
            return cls(value.upper())
        except ValueError:
            return cls.OK

    def __lt__(self, other):
        order = [Severity.OK, Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
        return order.index(self) < order.index(other)


@dataclass
class Issue:
    description: str
    severity: Severity
    location: Optional[str] = None
    suggestion: Optional[str] = None


@dataclass
class ReviewResult:
    adapter_name: str
    severity: Severity
    issues: List[Issue]
    raw_response: str
    success: bool = True
    error: Optional[str] = None
    duration_ms: int = 0
    is_self_review: bool = False  # Whether this is Claude self review

    def to_dict(self) -> Dict[str, Any]:
        return {
            "adapter": self.adapter_name,
            "severity": self.severity.value,
            "issues": [
                {
                    "description": i.description,
                    "severity": i.severity.value,
                    "location": i.location,
                    "suggestion": i.suggestion
                }
                for i in self.issues
            ],
            "success": self.success,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "is_self_review": self.is_self_review
        }


class LLMAdapter(ABC):
    """LLM Adapter base interface"""

    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.config = config
        self.timeout = config.get("timeout_seconds", 60)

    @abstractmethod
    def review(self, prompt: str, context: Dict[str, Any]) -> ReviewResult:
        """
        Perform code review

        Args:
            prompt: Review prompt
            context: Dynamic context (diff, file_path, etc.)

        Returns:
            ReviewResult
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if adapter is available (CLI installation, etc.)"""
        pass

    def parse_response(self, response: str) -> ReviewResult:
        """
        Parse LLM response to create ReviewResult

        Expected JSON format:
        {
            "severity": "OK|LOW|MEDIUM|HIGH|CRITICAL",
            "issues": [
                {
                    "description": "Issue description",
                    "severity": "...",
                    "location": "file:line",
                    "suggestion": "Fix suggestion"
                }
            ]
        }
        """
        import json
        import re

        try:
            # Try to extract JSON block
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
            if json_match:
                response = json_match.group(1)

            data = json.loads(response)
            severity = Severity.from_string(data.get("severity", "OK"))
            issues = [
                Issue(
                    description=i.get("description", ""),
                    severity=Severity.from_string(i.get("severity", "OK")),
                    location=i.get("location"),
                    suggestion=i.get("suggestion")
                )
                for i in data.get("issues", [])
            ]

            return ReviewResult(
                adapter_name=self.name,
                severity=severity,
                issues=issues,
                raw_response=response,
                success=True
            )

        except (json.JSONDecodeError, KeyError) as e:
            # Fallback to text analysis on JSON parse failure
            return self._parse_text_response(response)

    def _parse_text_response(self, response: str) -> ReviewResult:
        """Infer severity from text response"""
        response_lower = response.lower()

        if any(word in response_lower for word in ["critical", "security vulnerability"]):
            severity = Severity.CRITICAL
        elif any(word in response_lower for word in ["high", "bug", "error"]):
            severity = Severity.HIGH
        elif any(word in response_lower for word in ["medium", "improvement"]):
            severity = Severity.MEDIUM
        elif any(word in response_lower for word in ["low", "minor", "trivial"]):
            severity = Severity.LOW
        else:
            severity = Severity.OK

        return ReviewResult(
            adapter_name=self.name,
            severity=severity,
            issues=[Issue(description=response, severity=severity)],
            raw_response=response,
            success=True
        )
