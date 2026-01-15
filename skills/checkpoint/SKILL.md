# Checkpoint Skill

A checkpoint feature to manually save the current context.

## Usage

```
/checkpoint "message"
```

## Behavior

1. Save current Protected Context
2. Create semantic anchor with user message
3. Register checkpoint that can be referenced during recovery

## Examples

```
/checkpoint "Auth system implementation complete, chose JWT approach"
/checkpoint "Bug fix: resolved login redirect issue"
/checkpoint "Backup state before refactoring"
```

---

## Skill Execution Instructions

When a user runs the `/checkpoint` command, you **must** perform the following steps:

### 1. Parse Message
- Use the text after `/checkpoint` as the checkpoint message
- If no message provided, use "Manual checkpoint"

### 2. Save Checkpoint (Required)

**Execute the following command using the Bash tool:**

```bash
python ~/.claude/hooks/checkpoint_wrapper.py "checkpoint message"
```

Example:
```bash
python ~/.claude/hooks/checkpoint_wrapper.py "Auth system implementation complete"
```

### 3. Verify and Report Results

Report the command execution result to the user:

```
Checkpoint saved: "{message}"
- Time: {timestamp}
- Active files: {count}
- This checkpoint information will be recovered even after /compact.
```

### Notes
- Checkpoints save **context state**, not code state
- Separate from Git commits (use together when needed)
- Checkpoint information persists even after compact

### Error Handling
- On script execution failure: "Failed to save checkpoint. Please check the logs."
- On missing message: Use "Manual checkpoint" as default value
