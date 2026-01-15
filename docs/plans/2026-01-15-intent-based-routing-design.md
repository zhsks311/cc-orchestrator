# Intent-Based Agent Routing Design

## Status: Implemented

## Overview

Replace keyword-based triggers (`ultrawork`, `ulw`, `search`, `분석`) with intelligent intent-based routing that automatically selects the appropriate agent based on semantic analysis of user requests.

## Goals

1. Zero learning curve - automatic agent selection
2. Preserve manual control via @ mentions (`@oracle`, `@frontend`)
3. Handle ambiguity gracefully with confirmation prompts
4. Support retry/feedback loops

## Implementation

### 1. Enhanced AGENT_METADATA (`src/core/agents/prompts.ts`)

Each agent now has rich metadata:
- `description`: Detailed role description
- `expertise`: List of specialized areas
- `useWhen`: Trigger patterns for this agent
- `avoidWhen`: Situations to avoid
- `examples`: Input/output examples with `shouldUse` flags
- `aliases`: Multilingual name variations (Korean, English, abbreviations)

### 2. IntentAnalyzer (`src/core/routing/IntentAnalyzer.ts`)

Main analysis flow:
```
Query → Feedback Check → @ Mention → Parallel → Heuristic Analysis → Result
```

#### Detection Priority:
1. **Feedback patterns** (`다시 해줘`, `retry`, `다른 에이전트로`)
2. **Explicit @ mentions** (`@oracle`, `@frontend`)
3. **Parallel requests** (`@all`, `동시에`, `in parallel`)
4. **Heuristic scoring** (expertise, aliases, examples)

#### Confidence Levels:
- `high`: Execute immediately
- `medium`: Ask for confirmation, show alternatives
- `low`: Present all agent options

### 3. Feedback Loop

Three feedback types:
- `retry_same`: Retry with same agent
- `retry_different`: Try different agent
- `modify`: Adjust the previous result

Patterns detected:
- Korean: `다시 해줘`, `다른 에이전트로`, `수정해`, `더 자세히`
- English: `retry`, `again`, `different agent`, `modify`

### 4. Removed Legacy Code

Deleted from `src/types/orchestration.ts`:
- `ORCHESTRATION_TRIGGERS` constant
- `OrchestrationTrigger` type

Deleted from `src/core/orchestration/OrchestrationEngine.ts`:
- `detectTrigger()` method
- Trigger-based stage generation logic

## API Changes

### suggest_agent Response (examples)

**High Confidence:**
```json
{
  "suggested_agent": "oracle",
  "confidence": "high",
  "reason": "명시적 멘션",
  "recommendation": "Use background_task(agent=\"oracle\", prompt=\"...\")..."
}
```

**Feedback Request:**
```json
{
  "is_feedback_request": true,
  "feedback_type": "retry_same",
  "message": "같은 에이전트로 다시 시도할까요?",
  "actions": [...]
}
```

## Testing

33 tests passing:
- 15 ModelRouter tests (existing)
- 18 IntentAnalyzer tests (new)

Test coverage:
- @ mention detection
- Parallel execution detection
- Feedback pattern recognition
- Heuristic analysis basics
- Natural language agent references

## Commits

1. `feat: implement intent-based agent routing` - Core IntentAnalyzer
2. `refactor: remove keyword-based trigger system` - Remove legacy code
3. `feat: add feedback loop for retry requests` - Feedback detection
4. `test: add comprehensive tests for IntentAnalyzer` - Test suite

## Next Steps

1. Merge to main after review
2. Monitor actual usage patterns
3. Tune heuristic weights based on feedback
4. Consider LLM-based analysis for complex queries
