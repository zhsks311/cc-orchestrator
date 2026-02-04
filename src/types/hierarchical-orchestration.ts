/**
 * Type definitions for Hierarchical Orchestration
 */

import { AgentRole } from './agent.js';

/**
 * Task types that can be orchestrated
 */
export enum TaskType {
  RESEARCH = 'research',
  IMPLEMENT = 'implement',
  REVIEW = 'review',
  DESIGN = 'design',
  DOCUMENT = 'document',
  TEST = 'test',
  ANALYZE = 'analyze',
}

/**
 * Task complexity levels
 */
export type TaskComplexity = 'low' | 'medium' | 'high';

/**
 * Task execution status
 */
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SUCCESS = 'success',
  FAILURE = 'failure',
  SKIPPED = 'skipped',
}

/**
 * A decomposed task ready for execution
 */
export interface DecomposedTask {
  /** Unique task identifier */
  id: string;
  /** Human-readable task description */
  description: string;
  /** Type of task (research, implement, etc.) */
  type: TaskType;
  /** IDs of tasks that must complete before this one */
  dependencies: string[];
  /** Estimated complexity level */
  estimatedComplexity: TaskComplexity;
  /** Additional context for task execution */
  context?: Record<string, unknown>;
  /** Priority level (higher = more important) */
  priority?: number;
}

/**
 * Result of task decomposition
 */
export interface DecompositionResult {
  /** List of decomposed tasks */
  tasks: DecomposedTask[];
  /** Original user request */
  originalRequest: string;
  /** Decomposition reasoning */
  reasoning?: string;
  /** Whether decomposition was successful */
  success: boolean;
  /** Error message if decomposition failed */
  error?: string;
}

/**
 * Task assignment to an agent
 */
export interface TaskAssignment {
  /** The task to execute */
  task: DecomposedTask;
  /** Assigned agent role */
  agent: AgentRole;
  /** Confidence level (0-1) in this assignment */
  confidence: number;
  /** Reasoning for agent selection */
  reasoning?: string;
}

/**
 * DAG node representing a task with execution metadata
 */
export interface DAGNode {
  /** Task ID */
  taskId: string;
  /** The task itself */
  task: DecomposedTask;
  /** Assigned agent */
  agent: AgentRole;
  /** Task dependencies (IDs) */
  dependencies: string[];
  /** Tasks that depend on this one (IDs) */
  dependents: string[];
  /** Execution level (0 = no deps, higher = depends on lower levels) */
  level: number;
  /** Current execution status */
  status: TaskStatus;
}

/**
 * Execution DAG for orchestration
 */
export interface ExecutionDAG {
  /** Map of task ID to DAG node */
  nodes: Map<string, DAGNode>;
  /** Tasks grouped by execution level (each level can run in parallel) */
  levels: string[][];
  /** Total number of levels */
  totalLevels: number;
  /** Whether DAG is valid (no cycles) */
  isValid: boolean;
  /** Error message if DAG is invalid */
  validationError?: string;
}

/**
 * Result of a single task execution
 */
export interface ExecutionResult {
  /** Task ID */
  taskId: string;
  /** Task description */
  description: string;
  /** Agent that executed the task */
  agent: AgentRole;
  /** Execution status */
  status: TaskStatus;
  /** Agent's result (if successful) */
  result?: unknown;
  /** Error information (if failed) */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  /** Execution duration in milliseconds */
  duration: number;
  /** Number of retry attempts */
  retries: number;
  /** Start timestamp */
  startedAt: Date;
  /** End timestamp */
  completedAt: Date;
  /** Artifacts produced (file paths, URLs, etc.) */
  artifacts?: string[];
}

/**
 * Aggregated result from multiple task executions
 */
export interface AggregatedResult {
  /** High-level summary of all results */
  summary: string;
  /** Individual task results */
  taskResults: {
    taskId: string;
    description: string;
    agent: AgentRole;
    status: TaskStatus;
    keyFindings?: string;
    artifacts?: string[];
  }[];
  /** Failed tasks (if any) */
  failedTasks?: {
    taskId: string;
    description: string;
    error: string;
    impact: 'critical' | 'minor';
  }[];
  /** Suggested next steps */
  nextSteps?: string[];
  /** Overall execution statistics */
  statistics: {
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    skippedTasks: number;
    totalDuration: number;
    parallelismAchieved: number; // Ratio of parallel to sequential execution
  };
}

/**
 * Configuration for hierarchical orchestration
 */
export interface OrchestrationConfig {
  /** Maximum number of parallel tasks per level */
  maxParallelTasks?: number;
  /** Task execution timeout in milliseconds */
  taskTimeout?: number;
  /** Maximum retry attempts per task */
  maxRetries?: number;
  /** Enable detailed logging */
  debug?: boolean;
  /** Whether to stop on first failure */
  failFast?: boolean;
  /** Minimum confidence threshold for agent selection */
  minConfidence?: number;
}

/**
 * Context for orchestration execution
 */
export interface OrchestrationContext {
  /** Unique orchestration session ID */
  sessionId: string;
  /** Original user request */
  request: string;
  /** Timestamp when orchestration started */
  startedAt: Date;
  /** Shared context between tasks */
  sharedContext: Map<string, unknown>;
  /** Configuration */
  config: OrchestrationConfig;
}

/**
 * Error types specific to orchestration
 */
export class OrchestrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'OrchestrationError';
  }
}

export class TaskDecompositionError extends OrchestrationError {
  constructor(message: string, cause?: Error) {
    super(message, 'TASK_DECOMPOSITION_ERROR', cause);
    this.name = 'TaskDecompositionError';
  }
}

export class DAGValidationError extends OrchestrationError {
  constructor(message: string, cause?: Error) {
    super(message, 'DAG_VALIDATION_ERROR', cause);
    this.name = 'DAGValidationError';
  }
}

export class TaskExecutionError extends OrchestrationError {
  constructor(
    message: string,
    public taskId: string,
    cause?: Error
  ) {
    super(message, 'TASK_EXECUTION_ERROR', cause);
    this.name = 'TaskExecutionError';
  }
}
