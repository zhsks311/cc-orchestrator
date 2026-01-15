---
name: orchestrate
description: Multi-Model Orchestration - Guide for orchestrating multi-model agents
version: 2.0.0
author: CC Orchestrator
tags: [orchestration, multi-model, parallel, workflow]
---

# Multi-Model Orchestration Guide

Follow this guide to orchestrate multi-model agents effectively.

---

## Phase 0: Intent Gate (BLOCKING)

### Step 0: Request Classification

```
User request received
    ↓
[Classify request type]
├─ Trivial        → Use tools directly (no agent needed)
├─ Explicit       → Execute as instructed
├─ Exploratory    → Run scout/index in parallel
├─ Open-ended     → Go to Phase 1 (codebase evaluation needed)
├─ Research       → Run index first
├─ Design/Review  → Consult arch
└─ Ambiguous      → Ask only 1 clarifying question
```

### Step 1: Ambiguity Check

```
├─ Single interpretation      → Proceed
├─ Multiple + similar effort  → Make reasonable assumption, proceed
├─ 2x+ effort difference      → Must ask
└─ Missing key information    → Must ask
```

### Step 2: Verification Checklist

- [ ] Checked implicit assumptions?
- [ ] Is the search scope clear?
- [ ] Selected the appropriate agent?

---

## Phase 1: Codebase Evaluation (Open-ended tasks only)

### State Classification Matrix

| State | Signal | Action |
|-------|--------|--------|
| **Disciplined** | Consistent patterns, config exists | Strictly follow existing style |
| **Transition** | Mixed patterns | Ask "Which pattern to follow?" |
| **Legacy** | Inconsistent | "Suggest: Apply [X]?" |
| **Greenfield** | New project | Apply modern best practices |

---

## Phase 2: Execution

### 2A: Exploration & Research

**Tool Selection Priority:**

| Resource | Cost | When to Use |
|----------|------|-------------|
| Grep, Glob, Read | FREE | Clear scope, simple search |
| Task(Explore) | FREE | Internal codebase exploration |
| `index` | CHEAP | External docs, API references |
| `canvas` | MODERATE | UI/UX, styling |
| `arch` | EXPENSIVE | Architecture, code review, strategy |

**Parallel Execution Pattern:**

```
# Correct: Always run in parallel
background_task(agent="index", prompt="Research JWT best practices...")
background_task(agent="arch", prompt="Review authentication architecture...")
// Continue immediately - don't wait

# Wrong: Sequential waiting
result = wait_agent(...)  // Never do this - loses parallelism
```

**Exploration Stop Conditions:**
- Sufficient context acquired
- Same information appearing repeatedly
- No new info after 2 explorations
- Direct answer found

### 2B: Implementation

**Todo Creation Rules:**
- 2+ step task → Must create
- Ambiguous scope → Must create (clarifies thinking)
- User requests multiple items → Must create

**Workflow:**
1. Create immediately (no announcement)
2. Mark current task `in_progress`
3. Mark `completed` immediately upon completion
4. No batching (one at a time)

### 2C: Failure Recovery

**On 3 consecutive failures:**
1. Stop all edits
2. Restore to last known good state (git checkout, etc.)
3. Document what was attempted
4. Consult `arch`
5. Explain situation to user

---

## Phase 3: Completion Verification

**Checklist:**
- [ ] All todos completed
- [ ] No type errors (npx tsc --noEmit)
- [ ] Build passes (if exists)
- [ ] User request fully satisfied

**Cleanup:**
```
background_cancel(all=true)  // Cancel all background tasks
```

---

## Agent Selection Guide

### Agent Role Table

| Agent | Model | Purpose | Cost | Triggers |
|-------|-------|---------|------|----------|
| `arch` | GPT-5.2 | Architecture, strategy, code review | High | Design decisions, complex problems |
| `index` | Claude Sonnet | Doc search, external API, case studies | Low | Unknown libraries, external docs |
| `canvas` | Gemini Pro | UI/UX, styling, components | Medium | Visual changes, CSS, animations |
| `quill` | Gemini Pro | Technical docs, README, API docs | Medium | Documentation requests |
| `lens` | Gemini Flash | Image, PDF, screenshot analysis | Low | Visual asset analysis |

### Delegation Table

| Domain | Delegate To | Trigger Keywords |
|--------|-------------|------------------|
| Frontend UI/UX | `canvas` | style, color, animation, layout, responsive |
| External Research | `index` | library names, API, "how to", best practices |
| Architecture | `arch` | design, structure, pattern selection, tradeoffs |
| Code Review | `arch` | review, inspect, improvements |
| Documentation | `quill` | README, docs, guide, API docs |
| Image/PDF | `lens` | screenshot, image, PDF, diagram |

### Frontend Delegation Gate (BLOCKING)

**Must delegate when visual keywords detected:**
```
style, className, tailwind, color, background, border,
shadow, margin, padding, width, height, flex, grid,
animation, transition, hover, responsive, CSS
```

| Change Type | Examples | Action |
|-------------|----------|--------|
| Visual/UI | Colors, spacing, animations | **Must delegate** |
| Pure Logic | API calls, state management | Handle directly |
| Mixed | Both visual + logic | Separate and handle |

---

## Delegation Prompt Structure

**Required 7 Sections:**

```markdown
## TASK
[Atomic goal - single action only]

## EXPECTED
[Specific deliverable + success criteria]

## REQUIRED_TOOLS
[Tool whitelist to use]

## MUST_DO
[Explicit requirements]

## MUST_NOT_DO
[Forbidden actions - prevent rogue behavior]

## CONTEXT
[File paths, existing patterns, constraints]

## SUCCESS_CRITERIA
[Completion verification criteria]
```

---

## Execution Patterns

### Pattern A: Exploration + Implementation

```
1. background_task(index, "Search references...")  // Parallel
2. Start basic implementation simultaneously
3. Enhance implementation with index results
```

### Pattern B: Design Review

```
1. Write draft
2. background_task(arch, "Review architecture...")
3. Incorporate feedback
```

### Pattern C: Multi-perspective Collection

```
1. background_task(arch, "Architecture perspective...")    // Parallel
2. background_task(index, "Industry examples...")          // Parallel
3. background_task(canvas, "UX perspective...")            // Parallel
4. Integrate all three results
```

### Pattern D: Complex Implementation

```
1. Confirm design direction with arch
2. Research examples with index (parallel)
3. Proceed with implementation
4. Code review with arch
```

---

## Cost Optimization

```
├─ Simple research        → index (cheap)
├─ Codebase exploration   → Task(Explore) or direct tools (free)
├─ Architecture decisions → arch (only when needed)
├─ UI work               → canvas (only when needed)
└─ Simple search         → Grep, Glob (always free first)
```

**Principles:**
1. Don't call agents if free tools can solve it
2. Don't use expensive agents if cheap ones (index) suffice
3. Optimize time through parallel execution

---

## Forbidden Actions (Hard Blocks)

### Never Do

| Category | Forbidden |
|----------|-----------|
| Type Safety | Using `as any`, `@ts-ignore` |
| Error Handling | Empty catch blocks |
| Testing | Deleting failing tests to "pass" |
| Search | Calling agents for a single typo |
| Debugging | Random modifications (shotgun debugging) |
| Frontend | Handling visual changes directly (must delegate) |
| Commit | Committing without explicit request |

### Anti-Patterns

```
❌ Guessing without reading code
❌ Leaving failed state, moving to next task
❌ Sequential agent calls (when parallel possible)
❌ Unnecessary status update messages
❌ Excessive praise ("Great question!")
```

---

## Communication Style

### Conciseness Principle

```
❌ "I'm on it...", "Let me start by..."
✅ Start work immediately

❌ Explaining work (unless asked)
✅ Present results only

❌ "Great question!", "Excellent choice!"
✅ Get straight to the point
```

### Raising Concerns

```
"[Observation] I found that [issue] could occur because [reason].
Alternative: [suggestion]
Proceed as planned or try the alternative?"
```

---

## Tool Reference

```
background_task(agent, prompt, description?, priority?)
  → Returns task_id, starts execution immediately

background_output(task_id, block?, timeout_ms?)
  → block=false: Returns status immediately
  → block=true: Waits until completion

background_cancel(task_id?, all?)
  → task_id: Cancel specific task
  → all=true: Cancel all tasks

list_tasks(filter?)
  → Query current task list

share_context(key, value, scope?, ttl_seconds?)
  → Share context between agents

get_context(key, scope?)
  → Retrieve shared context
```

---

## Request Processing Flowchart

```
User request: "$ARGUMENTS"

[Step 1: Classification]
├─ Trivial?      → Handle directly
├─ Research?     → Run index
├─ Design?       → Consult arch
├─ UI/Visual?    → Delegate to canvas
├─ Complex?      → Multi-agent parallel
└─ Ambiguous?    → 1 question

[Step 2: Execution]
├─ Identify parallelizable tasks
├─ Execute simultaneously via background_task
├─ Handle directly what can be done immediately
└─ Collect and integrate results

[Step 3: Verification]
├─ Request fully satisfied?
├─ No errors?
└─ Cleanup complete?

[Step 4: Response]
├─ Deliver results
└─ background_cancel(all=true)
```

Follow this guide to process requests.
