#!/usr/bin/env python3
"""
Summary Saver Wrapper
PreCompact/SessionEnd hook to save work summary

PreCompact: Extract summary from conversation before context compression
SessionEnd: Save final summary when session ends
"""

import sys
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

HOOKS_DIR = Path(__file__).parent
LOG_FILE = HOOKS_DIR / "logs" / "summary-saver.log"


def log(message: str):
    """Debug logging"""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def extract_user_intent(transcript: List[Dict]) -> Optional[str]:
    """
    Extract user intent from conversation
    Get intent from first user message
    """
    for entry in transcript:
        if entry.get("type") == "user":
            content = entry.get("content", "")
            if isinstance(content, list):
                # Extract text parts when content is a list
                texts = [
                    c.get("text", "")
                    for c in content
                    if isinstance(c, dict) and c.get("type") == "text"
                ]
                content = " ".join(texts)

            if content and len(content) > 5:  # Exclude too short content
                # Limit to 500 characters max
                return content[:500] if len(content) > 500 else content
    return None


def extract_key_decisions(transcript: List[Dict]) -> List[str]:
    """
    Extract key decisions from conversation
    Find decision-related content from Claude's responses
    """
    decisions = []
    decision_keywords = [
        "decided", "chose", "approach", "solution", "implement",
        "selected", "using", "will use", "going with"
    ]

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

            # Extract sentences containing decision keywords
            sentences = content.replace("\n", ". ").split(". ")
            for sentence in sentences:
                sentence = sentence.strip()
                if len(sentence) < 10 or len(sentence) > 200:
                    continue

                for keyword in decision_keywords:
                    if keyword in sentence.lower():
                        # Prevent duplicates
                        if sentence not in decisions:
                            decisions.append(sentence)
                        break

            # Max 10 items
            if len(decisions) >= 10:
                break

    return decisions[-5:]  # Return only last 5


def extract_work_summary(transcript: List[Dict]) -> Optional[str]:
    """
    Extract work summary from conversation
    Find summary section from last Claude response
    """
    # Find last assistant response
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

    # Find summary-related sections
    summary_markers = ["## Summary", "completed", "done", "finished", "implemented"]
    for marker in summary_markers:
        if marker.lower() in last_assistant_content.lower():
            idx = last_assistant_content.lower().find(marker.lower())
            summary = last_assistant_content[idx:idx+500]
            return summary

    # Return last 200 characters
    if len(last_assistant_content) > 200:
        return "..." + last_assistant_content[-200:]
    return last_assistant_content


def save_summary(session_id: str, hook_event: str, transcript: List[Dict], cwd: str):
    """Save summary information"""
    sys.path.insert(0, str(HOOKS_DIR))
    from context_resilience import (
        get_protected_context_manager,
        get_config,
        get_semantic_anchor_manager,
        AnchorType,
    )

    config = get_config()
    if not config.enabled:
        log("Context resilience disabled")
        return

    manager = get_protected_context_manager()
    anchor_manager = get_semantic_anchor_manager()

    # Extract and save user intent
    user_intent = extract_user_intent(transcript)
    if user_intent:
        current_context = manager.load(session_id)
        # Update if no existing user_intent or if current is shorter
        if not current_context or not current_context.user_intent or len(current_context.user_intent) < len(user_intent):
            manager.set_user_intent(session_id, user_intent)
            log(f"Saved user_intent: {user_intent[:50]}...")

    # Extract and save key decisions
    decisions = extract_key_decisions(transcript)
    if decisions:
        for decision in decisions:
            manager.add_decision(session_id, decision)
        log(f"Saved {len(decisions)} decisions")

    # Save work summary as anchor
    work_summary = extract_work_summary(transcript)
    if work_summary:
        anchor_manager.add_anchor(
            session_id,
            AnchorType.CHECKPOINT,
            f"[{hook_event}] {work_summary[:200]}",
            context={
                "event": hook_event,
                "timestamp": datetime.now().isoformat()
            },
            importance=4
        )
        log(f"Saved work summary anchor for {hook_event}")


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
        cwd = hook_input.get("cwd", "")

        log(f"Processing {hook_event} for session {session_id[:8]}... (transcript: {len(transcript)} entries)")

        if transcript:
            save_summary(session_id, hook_event, transcript, cwd)
        else:
            log("No transcript available")

        # Always return continue=True
        print(json.dumps({"continue": True}))

    except Exception as e:
        log(f"Error processing: {e}")
        import traceback
        log(traceback.format_exc())
        print(json.dumps({"continue": True}))


if __name__ == "__main__":
    main()
