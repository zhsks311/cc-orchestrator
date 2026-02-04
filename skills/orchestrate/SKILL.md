---
name: orchestrate
description: Multi-Model Orchestration - Guide for orchestrating multi-model agents
version: 2.1.0
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
├─ Implementation → Delegate to coding agents (Pattern F for multi-file)
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
| `scout` agent | FREE | Codebase exploration (Task tool) |
| `index` agent | LOW | External docs, API research (Task tool) |
| `frontend-developer` | FREE | Frontend implementation (React, CSS, layouts) (Task tool) |
| `backend-architect` | FREE | Backend implementation (APIs, services) (Task tool) |
| `database-architect` | FREE | DB schema, migrations (Task tool) |
| `cloud-architect` | FREE | Infrastructure, deployment configs (Task tool) |
| `docs-architect` | FREE | Technical docs from code (quill free alternative) (Task tool) |
| `architect-review` | FREE | Architecture review (arch free alternative) (Task tool) |
| `general-purpose` | FREE | Any coding task, full tool access (Task tool) |
| `canvas` | MODERATE | UI/UX, styling (Gemini 3) |
| `quill` | MODERATE | Technical documentation (Gemini 3) |
| `lens` | MODERATE | Image/PDF analysis (Gemini 3) |
| `arch` | EXPENSIVE | Architecture, code review (GPT-5.2) |

**Agent Routing Rules (CRITICAL):**

```
┌─────────────────────────────────────────────────────────────┐
│ CLAUDE CODE NATIVE AGENTS (Task tool) - FREE/LOW-COST       │
│                                                             │
│   scout  → Task(subagent_type="scout", prompt="...")     │
│              FREE: Codebase exploration, file/function search│
│                                                             │
│   index  → Task(subagent_type="index", prompt="...")     │
│              LOW-COST: External research (WebSearch + Fetch)│
│                                                             │
│ MCP AGENTS (background_task) - PAID                         │
│                                                             │
│   arch   → background_task(agent="arch")   // OpenAI GPT-5.2│
│   canvas → background_task(agent="canvas") // Google Gemini │
│   quill  → background_task(agent="quill")  // Google Gemini │
│   lens   → background_task(agent="lens")   // Google Gemini │
└─────────────────────────────────────────────────────────────┘
```

**Parallel Execution Pattern:**

```bash
# Correct: Mixed parallel execution (Native + MCP)
Task(subagent_type="scout", prompt="Find auth patterns")  // FREE
background_task(agent="arch", prompt="Review security")   // PAID (GPT-5.2)
// Both run in parallel - continue immediately

# Wrong: MCP doesn't support scout/index
background_task(agent="scout", ...)  // ERROR - use Task tool instead
background_task(agent="index", ...)  // ERROR - use Task tool instead
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

**Claude Code Native Agents (Task tool) - FREE/LOW-COST:**

| Agent | Invocation | Purpose | Triggers |
|-------|------------|---------|----------|
| `scout` | `Task(subagent_type="scout")` | Codebase exploration, file/function search | "where is", "find", "how does X work" |
| `index` | `Task(subagent_type="index")` | External docs, APIs, best practices (low-cost) | library names, "how to", tutorials |

**MCP Agents (background_task) - PAID:**

| Agent | Model | Purpose | Cost | Triggers |
|-------|-------|---------|------|----------|
| `arch` | GPT-5.2 | Architecture, strategy, code review | High | Design decisions, complex problems |
| `canvas` | Gemini 3 | UI/UX, styling, components | Medium | Visual changes, CSS, animations |
| `quill` | Gemini 3 | Technical docs, README, API docs | Medium | Documentation requests |
| `lens` | Gemini 3 | Image, PDF, screenshot analysis | Medium | Visual asset analysis |

### Delegation Table

| Domain | Delegate To | Trigger Keywords |
|--------|-------------|------------------|
| Codebase exploration | `scout` (native) | find, where, search, structure |
| External Research | `index` (native, low-cost) | library names, API, "how to", best practices |
| Frontend UI/UX | `canvas` (MCP) | style, color, animation, layout, responsive |
| Architecture | `arch` (MCP) | design, structure, pattern selection, tradeoffs |
| Code Review | `arch` (MCP) | review, inspect, improvements |
| Documentation | `quill` (MCP) | README, docs, guide, API docs |
| Image/PDF | `lens` (MCP) | screenshot, image, PDF, diagram |

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
1. Task(subagent_type="scout", prompt="Find similar patterns")  // FREE
2. Start basic implementation simultaneously
3. Enhance implementation with exploration results
```

### Pattern B: Research + Implementation

```
1. Task(subagent_type="index", prompt="Find best practices")  // LOW-COST
2. Start basic implementation simultaneously
3. Apply researched patterns
```

### Pattern C: Design Review

```
1. Write draft
2. background_task(arch, "Review architecture...") // GPT-5.2
3. Incorporate feedback
```

### Pattern D: Multi-perspective Collection

```
1. Task(subagent_type="scout", prompt="Analyze codebase")    // FREE - Parallel
2. background_task(arch, "Architecture perspective...")      // GPT-5.2 - Parallel
3. background_task(canvas, "UX perspective...")              // Gemini - Parallel
4. Integrate all results
```

### Pattern E: Complex Implementation

```
1. Task(subagent_type="scout", prompt="Understand patterns") // FREE
2. Confirm design direction with arch (MCP)
3. Proceed with implementation
4. Code review with arch (MCP)
```

---

## Cost Optimization

```plaintext
FREE (Claude Code Task tool):
├─ Simple search          → Grep, Glob, Read (direct tools)
├─ Codebase exploration   → Task(subagent_type="scout")
└─ General tasks          → Task(subagent_type="general-purpose")

LOW-COST (Claude Code Task tool):
└─ External research      → Task(subagent_type="index")

PAID (MCP external APIs):
├─ Architecture decisions → arch (GPT-5.2, expensive)
├─ UI/UX work            → canvas (Gemini, moderate)
├─ Documentation         → quill (Gemini, moderate)
└─ Image/PDF analysis    → lens (Gemini, moderate)
```

**Principles:**
1. Always try FREE tools first (Grep, Glob, direct Read)
2. Use `scout` first (FREE), then `index` for external research (LOW-COST)
3. Only use MCP agents for external model capabilities (GPT, Gemini)
4. Parallel execution for time optimization

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
├─ Trivial?         → Handle directly (Grep, Glob, Read)
├─ Codebase search? → Task(subagent_type="scout") - FREE
├─ External docs?   → Task(subagent_type="index") - LOW-COST
├─ Design?          → background_task(agent="arch") - PAID
├─ UI/Visual?       → background_task(agent="canvas") - PAID
├─ Documentation?   → background_task(agent="quill") - PAID
├─ Image/PDF?       → background_task(agent="lens") - PAID
├─ Complex?         → Multi-agent parallel
└─ Ambiguous?       → 1 question

[Step 2: Agent Routing]
├─ Claude Code Task tool - MIXED COST
│   ├─ scout  → Task(subagent_type="scout")
│   └─ index  → Task(subagent_type="index") (LOW-COST)
└─ MCP agents (background_task) - PAID
    ├─ arch   → GPT-5.2
    ├─ canvas → Gemini 3
    ├─ quill  → Gemini 3
    └─ lens   → Gemini 3

[Step 3: Execution]
├─ Identify parallelizable tasks
├─ Run native agents + MCP agents in parallel
├─ Handle directly what can be done immediately
└─ Collect and integrate results

[Step 4: Verification]
├─ Request fully satisfied?
├─ No errors?
└─ Cleanup complete?

[Step 5: Response]
├─ Deliver results
└─ background_cancel(all=true)
```

Follow this guide to process requests.
