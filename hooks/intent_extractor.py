"""
Intent Extraction Module - Extract original user request from transcript
Includes summarization considering token limits
"""
import json
from pathlib import Path
from typing import Dict, Any, List, Optional


class IntentExtractor:
    """Extract user intent from transcript"""

    MAX_CHARS = 10000  # Token limit (approx 2500 tokens)
    SEPARATOR = "\n\n---\n\n"  # Message separator (used for both combining and truncation check)

    def extract_from_transcript(self, transcript_path: str) -> Dict[str, Any]:
        """
        Extract user intent from transcript file

        Args:
            transcript_path: transcript JSON file path

        Returns:
            Dict containing:
                - original_request: First user message (original request)
                - combined_intent: All user messages (with token limit)
                - message_count: Number of user messages
        """
        try:
            transcript = self._load_transcript(transcript_path)
            user_messages = self._extract_user_messages(transcript)

            if not user_messages:
                return self._empty_result()

            combined = self._combine_with_limit(user_messages)

            return {
                "original_request": user_messages[0],
                "combined_intent": combined,
                "message_count": len(user_messages),
                "truncated": len(self.SEPARATOR.join(user_messages)) > self.MAX_CHARS
            }
        except Exception as e:
            return {
                "original_request": "",
                "combined_intent": "",
                "message_count": 0,
                "truncated": False,
                "error": str(e)
            }

    def _load_transcript(self, transcript_path: str) -> List[Dict[str, Any]]:
        """Load transcript file"""
        path = Path(transcript_path)
        if not path.exists():
            return []

        content = path.read_text(encoding="utf-8")
        data = json.loads(content)

        # Handle based on transcript structure
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "messages" in data:
            return data["messages"]
        return []

    def _extract_user_messages(self, transcript: List[Dict[str, Any]]) -> List[str]:
        """Extract user messages only"""
        messages = []
        for msg in transcript:
            role = msg.get("role", "")
            if role == "user" or role == "human":
                content = msg.get("content", "")
                # Handle list content (multimodal)
                if isinstance(content, list):
                    text_parts = [
                        p.get("text", "") for p in content
                        if isinstance(p, dict) and p.get("type") == "text"
                    ]
                    content = "\n".join(text_parts)
                if content and content.strip():
                    messages.append(content.strip())
        return messages

    def _combine_with_limit(self, messages: List[str]) -> str:
        """
        Combine messages (with token limit)

        On limit exceeded: First message (original request) + last N messages
        """
        combined = self.SEPARATOR.join(messages)

        if len(combined) <= self.MAX_CHARS:
            return combined

        # First message is required
        first = messages[0]
        remaining_chars = self.MAX_CHARS - len(first) - 100  # Buffer space

        # Add messages from last in reverse order
        last_messages = []
        for msg in reversed(messages[1:]):
            if len(self.SEPARATOR.join(last_messages)) + len(msg) < remaining_chars:
                last_messages.insert(0, msg)
            else:
                break

        if last_messages:
            return f"{first}\n\n[...{len(messages) - 1 - len(last_messages)} middle messages omitted...]\n\n{self.SEPARATOR.join(last_messages)}"
        else:
            # Return only first message (if too long)
            return first[:self.MAX_CHARS]

    def _empty_result(self) -> Dict[str, Any]:
        """Return empty result"""
        return {
            "original_request": "",
            "combined_intent": "",
            "message_count": 0,
            "truncated": False
        }


# Convenience function
def get_intent_extractor() -> IntentExtractor:
    return IntentExtractor()
