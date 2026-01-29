# Hierarchical Orchestration Implementation Plan

## Overview

Hierarchical Orchestration enables CC Orchestrator to automatically decompose complex user requests into smaller tasks, assign the most suitable agents, and execute them in parallel with proper dependency management.

## Architecture

```
User Request
    ↓
TaskDecomposer (LLM-based)
    ↓
[Task1, Task2, Task3, ...]
    ↓
AgentSelector (Rule-based + LLM)
    ↓
[(Task1, Agent), (Task2, Agent), ...]
    ↓
DAGBuilder (Dependency Analysis)
    ↓
DAG with execution order
    ↓
ParallelExecutor (Async execution)
    ↓
[Result1, Result2, Result3, ...]
    ↓
ResultAggregator (LLM-based synthesis)
    ↓
Final Response
```

## Core Components

### 1. TaskDecomposer

**Purpose**: Break down complex user requests into atomic, actionable tasks.

**Implementation**:

- Use LLM (Claude Sonnet 4.5) to analyze user intent
- Identify discrete work units
- Extract dependencies between tasks
- Generate structured task list

**Input**: User prompt (string)

**Output**:

```typescript
interface DecomposedTask {
  id: string;
  description: string;
  type: TaskType; // research | implement | review | design | document
  dependencies: string[]; // IDs of tasks that must complete first
  estimatedComplexity: 'low' | 'medium' | 'high';
  context?: Record<string, unknown>; // Additional context
}
```

**Example**:

```
User: "Implement user authentication with JWT"

Tasks:
1. { id: "t1", description: "Research JWT best practices", type: "research", dependencies: [] }
2. { id: "t2", description: "Design auth system architecture", type: "design", dependencies: ["t1"] }
3. { id: "t3", description: "Implement JWT token service", type: "implement", dependencies: ["t2"] }
4. { id: "t4", description: "Implement auth middleware", type: "implement", dependencies: ["t2"] }
5. { id: "t5", description: "Review security implementation", type: "review", dependencies: ["t3", "t4"] }
```

### 2. AgentSelector

**Purpose**: Select the most suitable agent for each task.

**Implementation**:

- Rule-based selection for obvious cases
- LLM-based selection for ambiguous cases
- Consider agent specialization and availability

**Selection Logic**:

| Task Type                | Primary Agent | Fallback |
| ------------------------ | ------------- | -------- |
| research (external)      | index         | scout    |
| research (codebase)      | scout         | index    |
| implement (architecture) | arch          | -        |
| implement (frontend)     | canvas        | arch     |
| design (UI/UX)           | canvas        | -        |
| design (architecture)    | arch          | -        |
| review (code)            | arch          | -        |
| review (UI)              | canvas        | -        |
| document                 | quill         | -        |
| analyze (image/pdf)      | lens          | -        |

**Input**: DecomposedTask

**Output**:

```typescript
interface TaskAssignment {
  task: DecomposedTask;
  agent: AgentRole;
  confidence: number; // 0-1, how confident the selection is
  reasoning?: string; // Why this agent was selected
}
```

### 3. DAGBuilder

**Purpose**: Build a Directed Acyclic Graph representing task execution order.

**Implementation**:

- Parse task dependencies
- Validate no circular dependencies
- Identify parallel execution opportunities
- Generate execution levels (tasks that can run in parallel)

**Input**: TaskAssignment[]

**Output**:

```typescript
interface ExecutionDAG {
  nodes: Map<string, DAGNode>; // taskId -> node
  levels: string[][]; // Each level can execute in parallel
  totalLevels: number;
}

interface DAGNode {
  taskId: string;
  task: DecomposedTask;
  agent: AgentRole;
  dependencies: string[];
  dependents: string[]; // Tasks that depend on this one
  level: number; // Execution level (0 = no deps, can run first)
}
```

**Example**:

```
Level 0: [t1] (research - no dependencies)
Level 1: [t2] (design - depends on t1)
Level 2: [t3, t4] (implement - both depend on t2, can run in parallel)
Level 3: [t5] (review - depends on t3 and t4)
```

### 4. ParallelExecutor

**Purpose**: Execute tasks in parallel according to DAG.

**Implementation**:

- Process DAG level by level
- Within each level, execute all tasks in parallel
- Wait for level completion before proceeding
- Handle task failures gracefully
- Support retry logic per task

**Input**: ExecutionDAG

**Output**:

```typescript
interface ExecutionResult {
  taskId: string;
  agent: AgentRole;
  status: 'success' | 'failure' | 'skipped';
  result?: unknown; // Agent result
  error?: Error;
  duration: number; // milliseconds
  retries: number;
}
```

**Execution Flow**:

```typescript
for (const level of dag.levels) {
  // Execute all tasks in this level in parallel
  const promises = level.map((taskId) => executeTask(dag.nodes.get(taskId)));
  const results = await Promise.allSettled(promises);

  // Check for failures
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0 && isLevelCritical(level)) {
    // Abort remaining levels
    throw new OrchestrationError('Critical level failed');
  }
}
```

### 5. ResultAggregator

**Purpose**: Synthesize results from multiple agents into coherent response.

**Implementation**:

- Collect all ExecutionResults
- Use LLM (Claude Sonnet 4.5) to synthesize
- Present results in logical order
- Highlight key findings
- Handle partial failures gracefully

**Input**: ExecutionResult[]

**Output**:

```typescript
interface AggregatedResult {
  summary: string; // High-level summary
  taskResults: {
    taskId: string;
    description: string;
    agent: AgentRole;
    status: 'success' | 'failure' | 'skipped';
    key_findings?: string;
    artifacts?: string[]; // File paths, URLs, etc.
  }[];
  failedTasks?: {
    taskId: string;
    description: string;
    error: string;
    impact: 'critical' | 'minor';
  }[];
  nextSteps?: string[]; // Suggested follow-up actions
}
```

## File Structure

```
src/
├── core/
│   ├── orchestration/
│   │   ├── HierarchicalOrchestrator.ts   # Main orchestrator
│   │   ├── TaskDecomposer.ts             # Task breakdown
│   │   ├── AgentSelector.ts              # Agent selection
│   │   ├── DAGBuilder.ts                 # DAG construction
│   │   ├── ParallelExecutor.ts           # Parallel execution
│   │   └── ResultAggregator.ts           # Result synthesis
│   └── ...
├── types/
│   ├── orchestration.ts                   # Type definitions
│   └── ...
└── ...

tests/
├── core/
│   └── orchestration/
│       ├── TaskDecomposer.test.ts
│       ├── AgentSelector.test.ts
│       ├── DAGBuilder.test.ts
│       ├── ParallelExecutor.test.ts
│       └── ResultAggregator.test.ts
└── integration/
    └── hierarchical-orchestration-integration.test.ts
```

## Implementation Phases

### Phase 1: Type Definitions & Core Interfaces

- [x] Define all TypeScript interfaces
- [x] Create type definitions file
- [x] Document interface contracts

### Phase 2: Task Decomposition

- [x] Implement TaskDecomposer
- [x] Create LLM prompt for task breakdown
- [x] Handle edge cases (trivial tasks, single-step tasks)
- [ ] Unit tests

### Phase 3: Agent Selection

- [ ] Implement AgentSelector
- [ ] Rule-based selection logic
- [ ] LLM-based fallback for ambiguous cases
- [ ] Unit tests

### Phase 4: DAG Construction

- [ ] Implement DAGBuilder
- [ ] Dependency graph construction
- [ ] Cycle detection
- [ ] Level calculation
- [ ] Unit tests

### Phase 5: Parallel Execution

- [ ] Implement ParallelExecutor
- [ ] Level-by-level execution
- [ ] Error handling & retry logic
- [ ] Task timeout management
- [ ] Unit tests

### Phase 6: Result Aggregation

- [ ] Implement ResultAggregator
- [ ] LLM-based synthesis
- [ ] Partial failure handling
- [ ] Unit tests

### Phase 7: Integration

- [ ] Integrate with existing MCP server
- [ ] Add tool definition for hierarchical orchestration
- [ ] Update orchestrate skill to use hierarchical mode
- [ ] Integration tests

### Phase 8: Documentation & Testing

- [ ] Update README
- [ ] Add usage examples
- [ ] Run full test suite
- [ ] Performance testing

## Configuration

Environment variables:

```bash
# Enable/disable hierarchical orchestration
CCO_HIERARCHICAL_MODE=true

# Maximum parallel tasks per level
CCO_MAX_PARALLEL_TASKS=5

# Task timeout (milliseconds)
CCO_TASK_TIMEOUT=300000

# Enable detailed orchestration logging
CCO_ORCHESTRATION_DEBUG=false
```

## Example Usage

```typescript
// User request
const request = 'Implement user authentication with JWT and create comprehensive documentation';

// HierarchicalOrchestrator automatically:
// 1. Decomposes into: research → design → implement → test → document
// 2. Assigns agents: index, arch, arch, arch, quill
// 3. Builds DAG with dependencies
// 4. Executes in parallel where possible
// 5. Aggregates results into coherent response

const orchestrator = new HierarchicalOrchestrator({
  modelRouter,
  agentManager,
  contextManager,
});

const result = await orchestrator.orchestrate(request);

console.log(result.summary);
// "Successfully implemented JWT authentication system with comprehensive documentation.
//  The system includes token generation, validation middleware, and security best practices.
//  All code has been reviewed and documented."
```

## Benefits

1. **Automatic Task Breakdown**: No manual task planning required
2. **Optimal Agent Selection**: Right agent for each task
3. **Maximum Parallelism**: Execute independent tasks simultaneously
4. **Dependency Management**: Ensure proper execution order
5. **Resilience**: Handle partial failures gracefully
6. **Transparency**: Clear visibility into task execution

## Success Criteria

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Documentation complete
- [ ] Performance: 2x faster than sequential execution (for parallelizable tasks)
- [ ] Reliability: Handle 90%+ of task decomposition correctly
- [ ] No regression in existing features

## Timeline

Estimated: 8-12 hours

- Phase 1-2: 2 hours
- Phase 3-4: 2 hours
- Phase 5-6: 2 hours
- Phase 7: 2 hours
- Phase 8: 2 hours

## Status

**Current Phase**: Phase 7 - Integration
**Next Action**: Integrate hierarchical orchestrator with server entrypoints and add tests

### Implementation Progress (2026-01-30)

- [x] AgentSelector implemented
- [x] DAGBuilder implemented
- [x] ParallelExecutor implemented
- [x] ResultAggregator implemented
- [x] HierarchicalOrchestrator implemented
- [ ] LSP diagnostics clean for new files
- [x] npm run typecheck

Note: LSP diagnostics could not run (typescript-language-server not installed).
