/**
 * Orchestration Engine
 * DAG 기반 워크플로우 실행, 의존성 관리, 결과 집계
 */

import { IAgentManager } from '../agents/AgentManager.js';
import { IContextStore } from '../context/ContextStore.js';
import { Logger } from '../../infrastructure/Logger.js';
import {
  AgentRole,
  AgentStatus,
  Priority,
  ContextScope,
  AgentError,
} from '../../types/index.js';
import {
  Stage,
  ExecutionPlan,
  Orchestration,
  OrchestrationStatus,
  OrchestrationParams,
  OrchestrationResult,
  ORCHESTRATION_TRIGGERS,
  OrchestrationTrigger,
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

    // 트리거 감지 및 실행 계획 생성
    const trigger = this.detectTrigger(params.goal);
    const executionPlan = this.createExecutionPlan(
      params.goal,
      trigger,
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
      trigger,
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
      // DAG 기반 실행: 의존성 없는 스테이지들은 병렬 실행
      const executedStages = new Set<string>();
      const stageAgentMap = new Map<string, string>();

      while (executedStages.size < orchestration.executionPlan.stages.length) {
        // 실행 가능한 스테이지 찾기 (모든 의존성이 완료된 것)
        const readyStages = orchestration.executionPlan.stages.filter(
          (stage) =>
            !executedStages.has(stage.id) &&
            stage.dependsOn.every((depId) => executedStages.has(depId))
        );

        if (readyStages.length === 0 && executedStages.size < orchestration.executionPlan.stages.length) {
          throw new Error('Circular dependency detected in execution plan');
        }

        // 준비된 스테이지들 병렬 실행
        const stagePromises = readyStages.map(async (stage) => {
          const result = await this.executeStage(orchestration, stage, stageAgentMap);
          executedStages.add(stage.id);
          return result;
        });

        const results = await Promise.all(stagePromises);

        // 결과 저장
        const resultsMap = this.stageResults.get(orchestrationId)!;
        for (const result of results) {
          resultsMap.set(result.stageId, result);
          orchestration.agentIds.push(result.agentId);
          stageAgentMap.set(result.stageId, result.agentId);

          // 컨텍스트에 스테이지 결과 공유 (다음 스테이지에서 사용 가능)
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

      // 최종 결과 집계
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
    previousStageAgents: Map<string, string>
  ): Promise<StageResult> {
    this.logger.debug('Executing stage', {
      orchestrationId: orchestration.id,
      stageId: stage.id,
      role: stage.role,
    });

    // 이전 스테이지 결과를 컨텍스트로 수집
    const dependencyResults: Record<string, unknown> = {};
    for (const depId of stage.dependsOn) {
      const resultsMap = this.stageResults.get(orchestration.id);
      const depResult = resultsMap?.get(depId);
      if (depResult?.result) {
        dependencyResults[depId] = depResult.result;
      }
    }

    // 에이전트 생성 및 실행
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

    // 완료 대기
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

    // 모든 실행 중인 에이전트 취소
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
    return Array.from(this.orchestrations.values()).filter(
      (o) => o.sessionId === sessionId
    );
  }

  private detectTrigger(goal: string): OrchestrationTrigger | null {
    const lowerGoal = goal.toLowerCase();

    if (lowerGoal.includes('ultrawork') || lowerGoal.includes('ulw')) {
      return 'ultrawork';
    }
    if (lowerGoal.includes('search') || lowerGoal.includes('찾아')) {
      return 'search';
    }
    if (lowerGoal.includes('analyze') || lowerGoal.includes('분석')) {
      return 'analyze';
    }
    if (lowerGoal.includes('design') || lowerGoal.includes('디자인')) {
      return 'design';
    }
    if (lowerGoal.includes('document') || lowerGoal.includes('문서')) {
      return 'document';
    }

    return null;
  }

  private createExecutionPlan(
    goal: string,
    trigger: OrchestrationTrigger | null,
    preferredRoles?: AgentRole[],
    qualityLevel: 'fast' | 'balanced' | 'thorough' = 'balanced'
  ): ExecutionPlan {
    let stages: Stage[];

    if (trigger) {
      const triggerConfig = ORCHESTRATION_TRIGGERS[trigger];

      if (triggerConfig.parallel) {
        // 병렬 실행: 모든 역할이 동시에 실행
        stages = triggerConfig.roles.map((role, index) => ({
          id: `stage-${index + 1}`,
          name: `${getRoleDescription(role)} 실행`,
          role,
          task: goal,
          dependsOn: [],
          inputs: {},
          priority: Priority.HIGH,
        }));
      } else {
        // 순차 실행: 이전 스테이지가 완료되어야 다음 실행
        stages = triggerConfig.roles.map((role, index) => ({
          id: `stage-${index + 1}`,
          name: `${getRoleDescription(role)} 실행`,
          role,
          task: goal,
          dependsOn: index > 0 ? [`stage-${index}`] : [],
          inputs: {},
          priority: Priority.HIGH,
        }));
      }
    } else if (preferredRoles && preferredRoles.length > 0) {
      // 사용자 지정 역할 사용
      stages = preferredRoles.map((role, index) => ({
        id: `stage-${index + 1}`,
        name: `${getRoleDescription(role)} 실행`,
        role,
        task: goal,
        dependsOn: [],
        inputs: {},
        priority: Priority.MEDIUM,
      }));
    } else {
      // 기본: Oracle만 사용
      stages = [{
        id: 'stage-1',
        name: 'Oracle 분석',
        role: AgentRole.ORACLE,
        task: goal,
        dependsOn: [],
        inputs: {},
        priority: Priority.MEDIUM,
      }];
    }

    // 품질 레벨에 따른 조정
    if (qualityLevel === 'thorough') {
      // thorough 모드: 모든 스테이지를 순차 실행으로 변경
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

    // 병렬 실행 가능한 스테이지 그룹 수 계산
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
