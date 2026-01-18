/**
 * Orchestration Engine
 * DAG-based workflow execution, dependency management, result aggregation
 */

import { IAgentManager } from '../agents/AgentManager.js';
import { IContextStore } from '../context/ContextStore.js';
import { Logger } from '../../infrastructure/Logger.js';
import { AgentRole, AgentStatus, Priority, ContextScope, AgentError } from '../../types/index.js';
import {
  Stage,
  ExecutionPlan,
  Orchestration,
  OrchestrationStatus,
  OrchestrationParams,
  OrchestrationResult,
} from '../../types/orchestration.js';
import { getRoleDescription } from '../agents/prompts.js';

export interface IOrchestrationEngine {
  createOrchestration(params: OrchestrationParams): Promise<Orchestration>;
  executeOrchestration(orchestrationId: string): Promise<OrchestrationResult>;
  getOrchestration(orchestrationId: string): Orchestration | undefined;
  cancelOrchestration(orchestrationId: string): Promise<void>;
  listOrchestrations(sessionId: string): Orchestration[];
}

interface StageResult {
  stageId: string;
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
  result?: unknown;
  error?: AgentError;
  executionTimeMs?: number;
}

export class OrchestrationEngine implements IOrchestrationEngine {
  private orchestrations: Map<string, Orchestration> = new Map();
  private stageResults: Map<string, Map<string, StageResult>> = new Map();
  private logger: Logger;

  constructor(
    private agentManager: IAgentManager,
    private contextStore: IContextStore
  ) {
    this.logger = new Logger('OrchestrationEngine');
  }

  async createOrchestration(params: OrchestrationParams): Promise<Orchestration> {
    const orchestrationId = `orch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create execution plan (using preferredRoles or defaults)
    const executionPlan = this.createExecutionPlan(
      params.goal,
      params.preferredRoles,
      params.constraints?.qualityLevel ?? 'balanced'
    );

    const orchestration: Orchestration = {
      id: orchestrationId,
      goal: params.goal,
      executionPlan,
      status: OrchestrationStatus.PLANNING,
      agentIds: [],
      createdAt: new Date(),
      sessionId: params.sessionId,
    };

    this.orchestrations.set(orchestrationId, orchestration);
    this.stageResults.set(orchestrationId, new Map());

    this.logger.info('Orchestration created', {
      orchestrationId,
      goal: params.goal,
      roles: params.preferredRoles,
      stageCount: executionPlan.stages.length,
    });

    return orchestration;
  }

  async executeOrchestration(orchestrationId: string): Promise<OrchestrationResult> {
    const orchestration = this.orchestrations.get(orchestrationId);
    if (!orchestration) {
      throw new Error(`Orchestration not found: ${orchestrationId}`);
    }

    const startTime = Date.now();
    orchestration.status = OrchestrationStatus.EXECUTING;

    try {
      // DAG-based execution: stages without dependencies run in parallel
      const executedStages = new Set<string>();
      const stageAgentMap = new Map<string, string>();

      while (executedStages.size < orchestration.executionPlan.stages.length) {
        // Find executable stages (all dependencies completed)
        const readyStages = orchestration.executionPlan.stages.filter(
          (stage) =>
            !executedStages.has(stage.id) &&
            stage.dependsOn.every((depId) => executedStages.has(depId))
        );

        if (
          readyStages.length === 0 &&
          executedStages.size < orchestration.executionPlan.stages.length
        ) {
          throw new Error('Circular dependency detected in execution plan');
        }

        // Execute ready stages in parallel
        const stagePromises = readyStages.map(async (stage) => {
          const result = await this.executeStage(orchestration, stage, stageAgentMap);
          executedStages.add(stage.id);
          return result;
        });

        const results = await Promise.all(stagePromises);

        // Save results
        const resultsMap = this.stageResults.get(orchestrationId)!;
        for (const result of results) {
          resultsMap.set(result.stageId, result);
          orchestration.agentIds.push(result.agentId);
          stageAgentMap.set(result.stageId, result.agentId);

          // Share stage result to context (available for next stages)
          if (result.result) {
            await this.contextStore.set({
              key: `stage_result:${result.stageId}`,
              value: result.result,
              scope: ContextScope.SESSION,
              sessionId: orchestration.sessionId,
              ttlSeconds: 3600,
            });
          }
        }
      }

      // Aggregate final results
      orchestration.status = OrchestrationStatus.COMPLETED;
      orchestration.completedAt = new Date();
      orchestration.totalExecutionTimeMs = Date.now() - startTime;
      orchestration.result = this.aggregateResults(orchestrationId);

      this.logger.info('Orchestration completed', {
        orchestrationId,
        totalTimeMs: orchestration.totalExecutionTimeMs,
        stagesExecuted: executedStages.size,
      });

      return {
        orchestrationId,
        status: OrchestrationStatus.COMPLETED,
        result: orchestration.result,
        totalExecutionTimeMs: orchestration.totalExecutionTimeMs,
        stageResults: this.getStageResultsObject(orchestrationId),
      };
    } catch (error) {
      orchestration.status = OrchestrationStatus.FAILED;
      orchestration.completedAt = new Date();
      orchestration.totalExecutionTimeMs = Date.now() - startTime;
      orchestration.error = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Orchestration failed', {
        orchestrationId,
        error: orchestration.error.message,
      });

      return {
        orchestrationId,
        status: OrchestrationStatus.FAILED,
        error: orchestration.error,
        totalExecutionTimeMs: orchestration.totalExecutionTimeMs,
        stageResults: this.getStageResultsObject(orchestrationId),
      };
    }
  }

  private async executeStage(
    orchestration: Orchestration,
    stage: Stage,
    _previousStageAgents: Map<string, string>
  ): Promise<StageResult> {
    this.logger.debug('Executing stage', {
      orchestrationId: orchestration.id,
      stageId: stage.id,
      role: stage.role,
    });

    // Collect previous stage results as context
    const dependencyResults: Record<string, unknown> = {};
    for (const depId of stage.dependsOn) {
      const resultsMap = this.stageResults.get(orchestration.id);
      const depResult = resultsMap?.get(depId);
      if (depResult?.result) {
        dependencyResults[depId] = depResult.result;
      }
    }

    // Create and execute agent
    const agent = await this.agentManager.createAgent({
      role: stage.role,
      task: stage.task,
      context: {
        orchestrationId: orchestration.id,
        stageId: stage.id,
        goal: orchestration.goal,
        dependencyResults,
        ...stage.inputs,
      },
      priority: stage.priority,
      sessionId: orchestration.sessionId,
    });

    // Wait for completion
    const waitResult = await this.agentManager.waitForCompletion(agent.id, 300000);

    return {
      stageId: stage.id,
      agentId: agent.id,
      role: stage.role,
      status: waitResult.status,
      result: waitResult.result,
      error: waitResult.error,
      executionTimeMs: waitResult.executionTimeMs,
    };
  }

  getOrchestration(orchestrationId: string): Orchestration | undefined {
    return this.orchestrations.get(orchestrationId);
  }

  async cancelOrchestration(orchestrationId: string): Promise<void> {
    const orchestration = this.orchestrations.get(orchestrationId);
    if (!orchestration) {
      throw new Error(`Orchestration not found: ${orchestrationId}`);
    }

    // Cancel all running agents
    for (const agentId of orchestration.agentIds) {
      try {
        await this.agentManager.cancelAgent(agentId);
      } catch (error) {
        this.logger.warn('Failed to cancel agent', { agentId, error });
      }
    }

    orchestration.status = OrchestrationStatus.CANCELLED;
    orchestration.completedAt = new Date();

    this.logger.info('Orchestration cancelled', { orchestrationId });
  }

  listOrchestrations(sessionId: string): Orchestration[] {
    return Array.from(this.orchestrations.values()).filter((o) => o.sessionId === sessionId);
  }

  private createExecutionPlan(
    goal: string,
    preferredRoles?: AgentRole[],
    qualityLevel: 'fast' | 'balanced' | 'thorough' = 'balanced'
  ): ExecutionPlan {
    let stages: Stage[];

    if (preferredRoles && preferredRoles.length > 0) {
      // Use user-specified roles (parallel execution)
      stages = preferredRoles.map((role, index) => ({
        id: `stage-${index + 1}`,
        name: `${getRoleDescription(role)} execution`,
        role,
        task: goal,
        dependsOn: [],
        inputs: {},
        priority: Priority.MEDIUM,
      }));
    } else {
      // Default: use Arch only
      stages = [
        {
          id: 'stage-1',
          name: 'Arch analysis',
          role: AgentRole.ARCH,
          task: goal,
          dependsOn: [],
          inputs: {},
          priority: Priority.MEDIUM,
        },
      ];
    }

    // Adjust based on quality level
    if (qualityLevel === 'thorough') {
      // Thorough mode: convert all stages to sequential execution
      stages = stages.map((stage, index) => {
        const prevStage = index > 0 ? stages[index - 1] : null;
        return {
          ...stage,
          dependsOn: prevStage ? [prevStage.id] : [],
        };
      });
    }

    const estimatedDurationMs = this.estimateDuration(stages, qualityLevel);

    return {
      stages,
      dependencies: this.buildDependencyGraph(stages),
      estimatedDurationMs,
    };
  }

  private buildDependencyGraph(stages: Stage[]): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const stage of stages) {
      graph[stage.id] = stage.dependsOn;
    }
    return graph;
  }

  private estimateDuration(
    stages: Stage[],
    qualityLevel: 'fast' | 'balanced' | 'thorough'
  ): number {
    const baseTimePerStage = {
      fast: 5000,
      balanced: 15000,
      thorough: 30000,
    };

    // Calculate number of parallelizable stage groups
    const parallelGroups = this.countParallelGroups(stages);
    return parallelGroups * baseTimePerStage[qualityLevel];
  }

  private countParallelGroups(stages: Stage[]): number {
    const executed = new Set<string>();
    let groups = 0;

    while (executed.size < stages.length) {
      const ready = stages.filter(
        (s) => !executed.has(s.id) && s.dependsOn.every((d) => executed.has(d))
      );
      if (ready.length === 0) break;
      ready.forEach((s) => executed.add(s.id));
      groups++;
    }

    return groups;
  }

  private aggregateResults(orchestrationId: string): unknown {
    const resultsMap = this.stageResults.get(orchestrationId);
    if (!resultsMap) return null;

    const aggregated: Record<string, unknown> = {};
    let successCount = 0;
    let failureCount = 0;

    for (const [stageId, result] of resultsMap.entries()) {
      aggregated[stageId] = {
        role: result.role,
        status: result.status,
        result: result.result,
        error: result.error,
        executionTimeMs: result.executionTimeMs,
      };

      if (result.status === AgentStatus.COMPLETED) {
        successCount++;
      } else if (result.status === AgentStatus.FAILED) {
        failureCount++;
      }
    }

    return {
      summary: {
        totalStages: resultsMap.size,
        successCount,
        failureCount,
      },
      stages: aggregated,
    };
  }

  private getStageResultsObject(orchestrationId: string): Record<string, unknown> {
    const resultsMap = this.stageResults.get(orchestrationId);
    if (!resultsMap) return {};

    const obj: Record<string, unknown> = {};
    for (const [stageId, result] of resultsMap.entries()) {
      obj[stageId] = result;
    }
    return obj;
  }
}
