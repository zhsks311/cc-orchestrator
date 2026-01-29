import { Logger } from '../../infrastructure/Logger.js';
import { RetryStrategy } from '../../infrastructure/RetryStrategy.js';
import { IAgentManager } from '../agents/AgentManager.js';
import { AgentRole, AgentStatus, Priority } from '../../types/agent.js';
import {
  ExecutionDAG,
  ExecutionResult,
  OrchestrationContext,
  TaskExecutionError,
  TaskStatus,
} from '../../types/hierarchical-orchestration.js';

class RetryableTaskExecutionError extends TaskExecutionError {
  constructor(
    message: string,
    taskId: string,
    public retryable: boolean,
    cause?: Error
  ) {
    super(message, taskId, cause);
  }
}

export interface IParallelExecutor {
  execute(dag: ExecutionDAG, context: OrchestrationContext): Promise<ExecutionResult[]>;
}

export class ParallelExecutor implements IParallelExecutor {
  private logger: Logger;

  constructor(private agentManager: IAgentManager) {
    this.logger = new Logger('ParallelExecutor');
  }

  async execute(dag: ExecutionDAG, context: OrchestrationContext): Promise<ExecutionResult[]> {
    if (!dag.isValid) {
      throw new TaskExecutionError(
        dag.validationError ?? 'Invalid DAG provided for execution',
        'dag-validation'
      );
    }

    const results: ExecutionResult[] = [];
    const resultsByTask = new Map<string, ExecutionResult>();

    const maxParallelTasks = Math.max(
      1,
      context.config.maxParallelTasks ?? parseInt(process.env.CCO_MAX_PARALLEL_TASKS ?? '5', 10)
    );
    const taskTimeout =
      context.config.taskTimeout ?? parseInt(process.env.CCO_TASK_TIMEOUT ?? '300000', 10);
    const maxRetries =
      context.config.maxRetries ?? parseInt(process.env.CCO_MAX_RETRIES ?? '3', 10);
    const failFast = context.config.failFast ?? false;

    for (const level of dag.levels) {
      const { runnable, skipped } = this.partitionRunnable(level, dag, resultsByTask);

      for (const skippedResult of skipped) {
        results.push(skippedResult);
        resultsByTask.set(skippedResult.taskId, skippedResult);
      }

      const batches = this.chunkTasks(runnable, maxParallelTasks);
      for (const batch of batches) {
        const settled = await Promise.allSettled(
          batch.map((taskId) =>
            this.executeTaskWithRetry(taskId, dag, context, resultsByTask, taskTimeout, maxRetries)
          )
        );

        const batchResults = settled.map((entry, index) => {
          if (entry.status === 'fulfilled') {
            return entry.value;
          }
          const taskId = batch[index] ?? 'unknown-task';
          const node = dag.nodes.get(taskId);
          return this.buildFailureResult(
            taskId,
            node?.task.description ?? 'Unknown task',
            node?.agent ?? AgentRole.ARCH,
            entry.reason
          );
        });

        for (const result of batchResults) {
          results.push(result);
          resultsByTask.set(result.taskId, result);
          const node = dag.nodes.get(result.taskId);
          if (node) {
            node.status = result.status;
          }

          if (result.status === TaskStatus.SUCCESS) {
            context.sharedContext.set(result.taskId, result.result ?? null);
          }
        }

        const batchFailed = batchResults.some((result) => result.status === TaskStatus.FAILURE);
        if (batchFailed && failFast) {
          this.logger.warn('Fail-fast triggered, skipping remaining tasks');
          const remaining = this.collectRemainingTasks(dag, resultsByTask);
          for (const taskId of remaining) {
            const node = dag.nodes.get(taskId);
            if (!node) {
              continue;
            }
            const skippedResult = this.buildSkippedResult(
              taskId,
              node.task.description,
              node.agent,
              'Skipped due to fail-fast after task failure.'
            );
            results.push(skippedResult);
            resultsByTask.set(taskId, skippedResult);
          }
          return results;
        }
      }
    }

    return results;
  }

  private async executeTaskWithRetry(
    taskId: string,
    dag: ExecutionDAG,
    context: OrchestrationContext,
    resultsByTask: Map<string, ExecutionResult>,
    taskTimeout: number,
    maxRetries: number
  ): Promise<ExecutionResult> {
    const node = dag.nodes.get(taskId);
    if (!node) {
      return this.buildFailureResult(
        taskId,
        'Unknown task',
        AgentRole.ARCH,
        new Error('Task missing')
      );
    }

    node.status = TaskStatus.IN_PROGRESS;
    const baseStrategy = new RetryStrategy();
    const retryStrategy = new RetryStrategy({
      maxRetries,
      shouldRetry: (error) => {
        if (error instanceof RetryableTaskExecutionError) {
          return error.retryable;
        }
        return baseStrategy.isRetryable(error);
      },
      onRetry: (error, attempt, delayMs) => {
        this.logger.warn('Retrying task execution', {
          taskId,
          attempt,
          delayMs,
          error: error.message,
        });
      },
    });

    const startedAt = new Date();

    const result = await retryStrategy.executeWithResult(async () => {
      const dependencyResults = this.collectDependencyResults(node.dependencies, resultsByTask);
      const agent = await this.agentManager.createAgent({
        role: node.agent,
        task: node.task.description,
        context: {
          sessionId: context.sessionId,
          request: context.request,
          taskId: node.taskId,
          dependencies: node.dependencies,
          dependencyResults,
          taskContext: node.task.context ?? {},
          sharedContext: this.serializeSharedContext(context.sharedContext),
        },
        priority: this.mapPriority(node.task.priority, node.task.estimatedComplexity),
        sessionId: context.sessionId,
      });

      const agentResult = await this.agentManager.waitForCompletion(agent.id, taskTimeout);
      if (agentResult.status === AgentStatus.COMPLETED) {
        return {
          taskId,
          description: node.task.description,
          agent: node.agent,
          status: TaskStatus.SUCCESS,
          result: agentResult.result,
          duration: agentResult.executionTimeMs,
          retries: 0,
          startedAt,
          completedAt: new Date(),
          artifacts: this.extractArtifacts(agentResult.result),
        } as ExecutionResult;
      }

      const errorMessage = agentResult.error?.message ?? `Agent status: ${agentResult.status}`;
      const error = new RetryableTaskExecutionError(
        errorMessage,
        taskId,
        agentResult.error?.retryable ?? false
      );
      throw error;
    });

    const completedAt = new Date();
    if (result.success && result.result) {
      const executionResult = result.result;
      executionResult.retries = Math.max(0, result.attempts - 1);
      executionResult.duration = completedAt.getTime() - startedAt.getTime();
      executionResult.completedAt = completedAt;
      return executionResult;
    }

    const error = result.error ?? new Error('Task execution failed');
    return this.buildFailureResult(taskId, node.task.description, node.agent, error, {
      startedAt,
      completedAt,
      retries: Math.max(0, result.attempts - 1),
    });
  }

  private partitionRunnable(
    level: string[],
    dag: ExecutionDAG,
    resultsByTask: Map<string, ExecutionResult>
  ): { runnable: string[]; skipped: ExecutionResult[] } {
    const runnable: string[] = [];
    const skipped: ExecutionResult[] = [];

    for (const taskId of level) {
      const node = dag.nodes.get(taskId);
      if (!node) {
        skipped.push(
          this.buildSkippedResult(taskId, 'Unknown task', AgentRole.ARCH, 'Task missing')
        );
        continue;
      }

      const dependencyFailures = node.dependencies.filter((depId) => {
        const depResult = resultsByTask.get(depId);
        return depResult && depResult.status !== TaskStatus.SUCCESS;
      });

      if (dependencyFailures.length > 0) {
        const reason = `Skipped due to failed dependencies: ${dependencyFailures.join(', ')}`;
        skipped.push(this.buildSkippedResult(taskId, node.task.description, node.agent, reason));
        continue;
      }

      runnable.push(taskId);
    }

    return { runnable, skipped };
  }

  private chunkTasks(taskIds: string[], maxParallelTasks: number): string[][] {
    if (maxParallelTasks <= 0 || taskIds.length <= maxParallelTasks) {
      return [taskIds];
    }

    const batches: string[][] = [];
    for (let i = 0; i < taskIds.length; i += maxParallelTasks) {
      batches.push(taskIds.slice(i, i + maxParallelTasks));
    }

    return batches;
  }

  private collectDependencyResults(
    dependencies: string[],
    resultsByTask: Map<string, ExecutionResult>
  ): Record<string, unknown> {
    const dependencyResults: Record<string, unknown> = {};
    for (const depId of dependencies) {
      const depResult = resultsByTask.get(depId);
      if (depResult?.result !== undefined) {
        dependencyResults[depId] = depResult.result;
      }
    }
    return dependencyResults;
  }

  private collectRemainingTasks(
    dag: ExecutionDAG,
    resultsByTask: Map<string, ExecutionResult>
  ): string[] {
    const remaining: string[] = [];
    for (const taskId of dag.nodes.keys()) {
      if (!resultsByTask.has(taskId)) {
        remaining.push(taskId);
      }
    }
    return remaining;
  }

  private extractArtifacts(result: unknown): string[] | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }

    const record = result as Record<string, unknown>;
    if (Array.isArray(record.artifacts)) {
      return record.artifacts.filter((value) => typeof value === 'string') as string[];
    }

    return undefined;
  }

  private serializeSharedContext(sharedContext: Map<string, unknown>): Record<string, unknown> {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of sharedContext.entries()) {
      serialized[key] = value;
    }
    return serialized;
  }

  private buildFailureResult(
    taskId: string,
    description: string,
    agent: AgentRole,
    error: unknown,
    overrides?: { startedAt?: Date; completedAt?: Date; retries?: number }
  ): ExecutionResult {
    const err = error instanceof Error ? error : new Error(String(error));
    const startedAt = overrides?.startedAt ?? new Date();
    const completedAt = overrides?.completedAt ?? new Date();
    return {
      taskId,
      description,
      agent,
      status: TaskStatus.FAILURE,
      error: {
        message: err.message,
        code: err.name,
        stack: err.stack,
      },
      duration: completedAt.getTime() - startedAt.getTime(),
      retries: overrides?.retries ?? 0,
      startedAt,
      completedAt,
    };
  }

  private buildSkippedResult(
    taskId: string,
    description: string,
    agent: AgentRole,
    reason: string
  ): ExecutionResult {
    const startedAt = new Date();
    const completedAt = new Date();
    return {
      taskId,
      description,
      agent,
      status: TaskStatus.SKIPPED,
      error: {
        message: reason,
        code: 'SKIPPED',
      },
      duration: completedAt.getTime() - startedAt.getTime(),
      retries: 0,
      startedAt,
      completedAt,
    };
  }

  private mapPriority(priority: number | undefined, complexity: string): Priority {
    if (priority !== undefined) {
      if (priority >= 3) {
        return Priority.HIGH;
      }
      if (priority === 2) {
        return Priority.MEDIUM;
      }
      return Priority.LOW;
    }

    if (complexity === 'high') {
      return Priority.HIGH;
    }
    if (complexity === 'low') {
      return Priority.LOW;
    }
    return Priority.MEDIUM;
  }
}
