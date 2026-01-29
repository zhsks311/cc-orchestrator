import { v4 as uuidv4 } from 'uuid';
import { AgentRole } from '../../types/agent.js';
import { ContextScope } from '../../types/context.js';
import {
  AggregatedResult,
  DAGValidationError,
  OrchestrationConfig,
  OrchestrationContext,
  TaskAssignment,
  TaskDecompositionError,
  TaskExecutionError,
} from '../../types/hierarchical-orchestration.js';
import { Logger } from '../../infrastructure/Logger.js';
import { ModelRouter } from '../models/ModelRouter.js';
import { IAgentManager } from '../agents/AgentManager.js';
import { IContextStore } from '../context/ContextStore.js';
import { TaskDecomposer } from './TaskDecomposer.js';
import { AgentSelector } from './AgentSelector.js';
import { DAGBuilder } from './DAGBuilder.js';
import { ParallelExecutor } from './ParallelExecutor.js';
import { ResultAggregator } from './ResultAggregator.js';

export interface IHierarchicalOrchestrator {
  orchestrate(request: string, config?: OrchestrationConfig): Promise<AggregatedResult>;
}

export class HierarchicalOrchestrator implements IHierarchicalOrchestrator {
  private logger: Logger;
  private taskDecomposer: TaskDecomposer;
  private agentSelector: AgentSelector;
  private dagBuilder: DAGBuilder;
  private parallelExecutor: ParallelExecutor;
  private resultAggregator: ResultAggregator;

  constructor(
    private modelRouter: ModelRouter,
    private agentManager: IAgentManager,
    private contextStore: IContextStore
  ) {
    this.logger = new Logger('HierarchicalOrchestrator');
    this.taskDecomposer = new TaskDecomposer(this.modelRouter);
    this.agentSelector = new AgentSelector();
    this.dagBuilder = new DAGBuilder();
    this.parallelExecutor = new ParallelExecutor(this.agentManager);
    this.resultAggregator = new ResultAggregator(this.modelRouter);
  }

  async orchestrate(request: string, config?: OrchestrationConfig): Promise<AggregatedResult> {
    const orchestrationId = uuidv4();
    const mergedConfig = this.mergeConfig(config);
    const context: OrchestrationContext = {
      sessionId: orchestrationId,
      request,
      startedAt: new Date(),
      sharedContext: new Map(),
      config: mergedConfig,
    };

    this.logger.info('Hierarchical orchestration started', {
      orchestrationId,
      request,
    });

    try {
      await this.contextStore.set({
        key: 'orchestration:request',
        value: request,
        scope: ContextScope.SESSION,
        sessionId: orchestrationId,
        ttlSeconds: 3600,
      });

      const decomposition = await this.taskDecomposer.decompose(request);
      if (!decomposition.success) {
        throw new TaskDecompositionError(decomposition.error ?? 'Task decomposition failed');
      }

      const assignments = this.assignAgents(decomposition.tasks, mergedConfig);
      const dag = this.dagBuilder.buildDAG(assignments);
      if (!dag.isValid) {
        throw new DAGValidationError(dag.validationError ?? 'DAG validation failed');
      }

      const executionResults = await this.parallelExecutor.execute(dag, context);
      const aggregatedResult = await this.resultAggregator.aggregate(executionResults, context);

      await this.contextStore.set({
        key: 'orchestration:result',
        value: aggregatedResult,
        scope: ContextScope.SESSION,
        sessionId: orchestrationId,
        ttlSeconds: 3600,
      });

      this.logger.info('Hierarchical orchestration completed', {
        orchestrationId,
        totalTasks: executionResults.length,
      });

      return aggregatedResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Hierarchical orchestration failed', {
        orchestrationId,
        error: err,
      });

      if (error instanceof TaskDecompositionError || error instanceof DAGValidationError) {
        throw error;
      }

      throw new TaskExecutionError('Hierarchical orchestration failed', 'orchestration', err);
    }
  }

  private assignAgents(
    tasks: TaskAssignment['task'][],
    config: OrchestrationConfig
  ): TaskAssignment[] {
    const minConfidence = config.minConfidence ?? 0;
    return tasks.map((task) => {
      const assignment = this.agentSelector.selectAgent(task);
      if (assignment.confidence < minConfidence) {
        this.logger.warn('Low confidence assignment, falling back to Arch', {
          taskId: task.id,
          confidence: assignment.confidence,
          minConfidence,
        });
        return {
          ...assignment,
          agent: AgentRole.ARCH,
          confidence: Math.max(assignment.confidence, minConfidence),
          reasoning: `${assignment.reasoning ?? 'Low confidence selection.'} Fallback to Arch.`,
        };
      }
      return assignment;
    });
  }

  private mergeConfig(config?: OrchestrationConfig): OrchestrationConfig {
    const envDebug = process.env.CCO_ORCHESTRATION_DEBUG === 'true';
    return {
      maxParallelTasks:
        config?.maxParallelTasks ?? parseInt(process.env.CCO_MAX_PARALLEL_TASKS ?? '5', 10),
      taskTimeout: config?.taskTimeout ?? parseInt(process.env.CCO_TASK_TIMEOUT ?? '300000', 10),
      maxRetries: config?.maxRetries ?? parseInt(process.env.CCO_MAX_RETRIES ?? '3', 10),
      debug: config?.debug ?? envDebug,
      failFast: config?.failFast ?? false,
      minConfidence: config?.minConfidence ?? 0,
    };
  }
}
