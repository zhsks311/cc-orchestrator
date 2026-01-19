#!/usr/bin/env python3
"""
Summary Saver Wrapper
PreCompact/SessionEnd hook to save work summary

PreCompact: Extract summary from conversation before context compression
SessionEnd: Save final summary when session ends
"""

import sys
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, List

# ============================================================================
# Constants (configurable)
# ============================================================================
HOOKS_DIR = Path(__file__).parent
LOG_FILE = HOOKS_DIR / "logs" / "summary-saver.log"

# Extraction limits
MIN_INTENT_LENGTH = 2  # Minimum length for user intent
MAX_INTENT_LENGTH = 500  # Maximum length for user intent
MIN_SENTENCE_LENGTH = 10  # Minimum sentence length for decisions
MAX_SENTENCE_LENGTH = 200  # Maximum sentence length for decisions
MAX_DECISIONS = 5  # Maximum number of decisions to keep
MAX_SUMMARY_LENGTH = 500  # Maximum summary length

# Sensitive info patterns for masking
SENSITIVE_PATTERNS = [
    r'(?i)(api[_-]?key|apikey)["\s:=]+["\']?[\w-]{20,}["\']?',
    r'(?i)(secret|password|passwd|pwd)["\s:=]+["\']?[^\s"\']{8,}["\']?',
    r'(?i)(token|auth)["\s:=]+["\']?[\w-]{20,}["\']?',
    r'(?i)(bearer\s+)[\w-]{20,}',
    r'(?i)(ssh-rsa|ssh-ed25519)\s+[\w+/=]{40,}',
    r'(?i)(ghp_|gho_|github_pat_)[\w]{30,}',  # GitHub tokens
    r'(?i)(sk-|pk_live_|pk_test_)[\w]{20,}',  # API keys (OpenAI, Stripe, etc.)
]


def log(message: str):
    """Debug logging with sensitive info masking"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        masked_message = mask_sensitive_info(message)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {masked_message}\n")
    except Exception:
        pass


def mask_sensitive_info(text: str) -> str:
    """Mask sensitive information in text"""
    if not text:
        return text

    masked = text
    for pattern in SENSITIVE_PATTERNS:
        masked = re.sub(pattern, "[MASKED]", masked)
    return masked


def load_context_resilience():
    """
    Load context_resilience module by temporarily adding HOOKS_DIR to sys.path.

    Note: This module uses relative imports (from .submodule import ...), so we
    cannot use importlib.util.spec_from_file_location directly. Instead, we
    temporarily modify sys.path and restore it after import to minimize side effects.

    For a hook script that runs in isolation and exits, this approach is acceptable.
    """
    module_path = HOOKS_DIR / "context_resilience" / "__init__.py"
    if not module_path.exists():
        log(f"context_resilience module not found at {module_path}")
        return None

    hooks_dir_str = str(HOOKS_DIR)
    path_modified = False

    try:
        # Only add to path if not already present
        if hooks_dir_str not in sys.path:
            sys.path.insert(0, hooks_dir_str)
            path_modified = True

        # Import the module (this will resolve relative imports correctly)
        import context_resilience
        return context_resilience
    except Exception as e:
        log(f"Failed to load context_resilience: {e}")
        return None
    finally:
        # Clean up sys.path if we modified it (best effort)
        # Note: Other modules may have been imported, so removal is optional
        if path_modified and hooks_dir_str in sys.path:
            try:
                sys.path.remove(hooks_dir_str)
            except ValueError:
                pass  # Already removed or not present


def extract_user_intent(transcript: List[Dict]) -> Optional[str]:
    """
    Extract user intent from conversation
    Get intent from first meaningful user message
    """
    for entry in transcript:
        if entry.get("type") == "user":
            content = entry.get("content", "")
            if isinstance(content, list):
                texts = [
                    c.get("text", "")
                    for c in content
                    if isinstance(c, dict) and c.get("type") == "text"
                ]
                content = " ".join(texts)

            # Accept shorter but meaningful content (>= MIN_INTENT_LENGTH)
            if content and len(content.strip()) >= MIN_INTENT_LENGTH:
                content = content.strip()
                return content[:MAX_INTENT_LENGTH] if len(content) > MAX_INTENT_LENGTH else content
    return None


def split_sentences(text: str) -> List[str]:
    """
    Split text into sentences using regex
    Handles multiple delimiters properly
    """
    # Split on sentence-ending punctuation followed by whitespace, or newlines
    sentences = re.split(r'(?<=[.?!])\s+|\n+', text)
    return [s.strip() for s in sentences if s.strip()]


def extract_key_decisions(transcript: List[Dict]) -> List[str]:
    """
    Extract key decisions from conversation
    Find decision-related content from Claude's responses
    Uses word boundary matching for more precise detection
    """
    decisions = []

    # More specific patterns with word boundaries
    decision_patterns = [
        r'\b(decided to|chose to|will implement|selected|going with)\b',
        r'\b(approach|solution|strategy):\s',
        r'\bI\'ll\s+(use|implement|create|add)\b',
        r'\bLet\'s\s+(use|go with|implement)\b',
    ]
    combined_pattern = re.compile('|'.join(decision_patterns), re.IGNORECASE)

    for entry in transcript:
        if entry.get("type") == "assistant":
            content = entry.get("content", "")
            if isinstance(content, list):
                texts = [
                    c.get("text", "")
                    for c in content
                    if isinstance(c, dict) and c.get("type") == "text"
                ]
                content = " ".join(texts)

            if not content:
                continue

            sentences = split_sentences(content)
            for sentence in sentences:
                if len(sentence) < MIN_SENTENCE_LENGTH or len(sentence) > MAX_SENTENCE_LENGTH:
                    continue

                if combined_pattern.search(sentence):
                    if sentence not in decisions:
                        decisions.append(sentence)
                        # Stop when we have enough decisions
                        if len(decisions) >= MAX_DECISIONS:
                            return decisions

    return decisions


def extract_work_summary(transcript: List[Dict]) -> Optional[str]:
    """
    Extract work summary from conversation
    Find summary section from last Claude response
    Prioritizes beginning of content (head) for better summary quality
    """
    last_assistant_content = None
    for entry in reversed(transcript):
        if entry.get("type") == "assistant":
            content = entry.get("content", "")
            if isinstance(content, list):
                texts = [
                    c.get("text", "")
                    for c in content
                    if isinstance(c, dict) and c.get("type") == "text"
                ]
                content = " ".join(texts)
            if content:
                last_assistant_content = content
                break

    if not last_assistant_content:
        return None

    # Priority: structured markers first (more specific)
    structured_markers = ["## Summary", "### Summary", "Summary:", "Conclusion:"]
    for marker in structured_markers:
        if marker in last_assistant_content:
            idx = last_assistant_content.find(marker)
            # Extract from marker, limit by sentence or length
            summary = last_assistant_content[idx:idx + MAX_SUMMARY_LENGTH]
            return summary

    # Fallback: look for completion indicators at sentence level
    completion_patterns = [
        r'\b(completed|finished|done|implemented)\b.*[.!]',
    ]
    for pattern in completion_patterns:
        match = re.search(pattern, last_assistant_content, re.IGNORECASE)
        if match:
            # Return the matching sentence and some context
            start = max(0, match.start() - 50)
            end = min(len(last_assistant_content), match.end() + 100)
            return last_assistant_content[start:end]

    # Final fallback: return first 200 characters (head, not tail)
    if len(last_assistant_content) > 200:
        return last_assistant_content[:200] + "..."
    return last_assistant_content


def save_summary(session_id: str, hook_event: str, transcript: List[Dict]):
    """
    Save summary information
    Each operation is wrapped in try/except to prevent partial failures
    """
    context_resilience = load_context_resilience()
    if context_resilience is None:
        log("Could not load context_resilience module")
        return

    try:
        config = context_resilience.get_config()
        if not config.enabled:
            log("Context resilience disabled")
            return
    except Exception as e:
        log(f"Failed to get config: {e}")
        return

    try:
        manager = context_resilience.get_protected_context_manager()
        anchor_manager = context_resilience.get_semantic_anchor_manager()
        AnchorType = context_resilience.AnchorType
    except Exception as e:
        log(f"Failed to get managers: {e}")
        return

    # Extract and save user intent
    try:
        user_intent = extract_user_intent(transcript)
        if user_intent:
            current_context = manager.load(session_id)
            if not current_context or not current_context.user_intent or len(current_context.user_intent) < len(user_intent):
                manager.set_user_intent(session_id, user_intent)
                # Mask sensitive info in log
                log(f"Saved user_intent: {mask_sensitive_info(user_intent[:50])}...")
    except Exception as e:
        log(f"Failed to save user_intent: {e}")

    # Extract and save key decisions
    try:
        decisions = extract_key_decisions(transcript)
        if decisions:
            for decision in decisions:
                manager.add_decision(session_id, decision)
            log(f"Saved {len(decisions)} decisions")
    except Exception as e:
        log(f"Failed to save decisions: {e}")

    # Save work summary as anchor with duplicate prevention
    try:
        work_summary = extract_work_summary(transcript)
        if work_summary:
            # Create unique anchor key to prevent duplicates
            anchor_content = f"[{hook_event}] {work_summary[:200]}"

            # Check for existing anchor with same event in recent anchors
            existing_anchors = anchor_manager.get_anchors(session_id)
            is_duplicate = any(
                anchor.content == anchor_content
                for anchor in existing_anchors[-5:]  # Check last 5 anchors
            ) if existing_anchors else False

            if not is_duplicate:
                anchor_manager.add_anchor(
                    session_id,
                    AnchorType.CHECKPOINT,
                    anchor_content,
                    context={
                        "event": hook_event,
                        "timestamp": datetime.now().isoformat()
                    },
                    importance=4
                )
                log(f"Saved work summary anchor for {hook_event}")
            else:
                log(f"Skipped duplicate anchor for {hook_event}")
    except Exception as e:
        log(f"Failed to save work summary anchor: {e}")


def main():
    """Main entrypoint"""
    log("summary_saver_wrapper.py executed")

    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"continue": True}))
            return

        hook_input = json.loads(input_data)
    except Exception as e:
        log(f"Error reading input: {e}")
        print(json.dumps({"continue": True}))
        return

    try:
        session_id = hook_input.get("session_id", "unknown")
        hook_event = hook_input.get("hook_event_name", "unknown")
        transcript = hook_input.get("transcript", [])

        log(f"Processing {hook_event} for session {session_id[:8]}... (transcript: {len(transcript)} entries)")

        if transcript:
            save_summary(session_id, hook_event, transcript)
        else:
            log("No transcript available")

        print(json.dumps({"continue": True}))

    except Exception as e:
        log(f"Error processing: {e}")
        import traceback
        log(traceback.format_exc())
        print(json.dumps({"continue": True}))


if __name__ == "__main__":
    main()
