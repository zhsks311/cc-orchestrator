/**
 * Tool Handlers
 * Renamed to match oh-my-opencode patterns
 */

import { IAgentManager } from '../../core/agents/AgentManager.js';
import { IContextStore } from '../../core/context/ContextStore.js';
import { IModelRouter } from '../../core/models/ModelRouter.js';
import {
  AgentRole,
  AgentStatus,
  ContextScope,
} from '../../types/index.js';
import { ValidationError } from '../../types/errors.js';
import { Logger } from '../../infrastructure/Logger.js';
import {
  BackgroundTaskInputSchema,
  BackgroundOutputInputSchema,
  BackgroundCancelInputSchema,
  ListTasksInputSchema,
  ShareContextInputSchema,
  GetContextInputSchema,
  SuggestAgentInputSchema,
} from '../tools/schemas.js';
import {
  getRoleDescription,
  AGENT_METADATA,
  parseAgentMention,
  isParallelRequest,
} from '../../core/agents/prompts.js';
import { IntentAnalyzer } from '../../core/routing/IntentAnalyzer.js';

export interface ToolHandlerDependencies {
  agentManager: IAgentManager;
  contextStore: IContextStore;
  modelRouter: IModelRouter;
  sessionId: string;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export class ToolHandlers {
  private agentManager: IAgentManager;
  private contextStore: IContextStore;
  private modelRouter: IModelRouter;
  private sessionId: string;
  private logger: Logger;
  private intentAnalyzer: IntentAnalyzer;

  constructor(deps: ToolHandlerDependencies) {
    this.agentManager = deps.agentManager;
    this.contextStore = deps.contextStore;
    this.modelRouter = deps.modelRouter;
    this.sessionId = deps.sessionId;
    this.logger = new Logger('ToolHandlers');
    this.intentAnalyzer = new IntentAnalyzer();
  }

  async handle(name: string, args: unknown): Promise<ToolResult> {
    try {
      switch (name) {
        case 'background_task':
          return await this.handleBackgroundTask(args);
        case 'background_output':
          return await this.handleBackgroundOutput(args);
        case 'background_cancel':
          return await this.handleBackgroundCancel(args);
        case 'list_tasks':
          return await this.handleListTasks(args);
        case 'share_context':
          return await this.handleShareContext(args);
        case 'get_context':
          return await this.handleGetContext(args);
        case 'suggest_agent':
          return await this.handleSuggestAgent(args);
        default:
          throw new ValidationError(`Unknown tool: ${name}`);
      }
    } catch (error) {
      this.logger.error('Tool execution failed', { tool: name, error });
      return this.formatError(error);
    }
  }

  private async handleBackgroundTask(args: unknown): Promise<ToolResult> {
    const input = BackgroundTaskInputSchema.parse(args);

    // API 키 확인 - 없으면 delegation 응답
    if (!this.modelRouter.hasAvailableProvider(input.agent)) {
      this.logger.info('No provider available, delegating to Claude Code', {
        agent: input.agent,
      });
      return this.formatDelegationResponse(input.agent, input.prompt);
    }

    const agent = await this.agentManager.createAgent({
      role: input.agent,
      task: input.prompt,
      context: input.description ? { description: input.description } : undefined,
      priority: input.priority,
      sessionId: this.sessionId,
    });

    this.logger.info('Background task started', {
      task_id: agent.id,
      agent: input.agent,
      description: input.description,
    });

    return this.formatResult({
      task_id: agent.id,
      status: 'running',
      agent: agent.role,
      agent_description: getRoleDescription(agent.role),
      message: `백그라운드 작업이 시작되었습니다. background_output(task_id="${agent.id}")로 상태를 확인하세요.`,
    });
  }

  /**
   * Claude Code Task tool subagent types
   */
  private static readonly SubagentType = {
    PLAN: 'Plan',
    EXPLORE: 'Explore',
    GENERAL: 'general-purpose',
  } as const;

  /**
   * API 키가 없을 때 Claude Code에게 위임하는 응답 생성
   */
  private formatDelegationResponse(agent: AgentRole, prompt: string): ToolResult {
    const { SubagentType } = ToolHandlers;
    const subagentMap: Record<AgentRole, string> = {
      [AgentRole.ARCH]: SubagentType.PLAN,
      [AgentRole.INDEX]: SubagentType.EXPLORE,
      [AgentRole.CANVAS]: SubagentType.GENERAL,
      [AgentRole.QUILL]: SubagentType.GENERAL,
      [AgentRole.LENS]: SubagentType.GENERAL,
      [AgentRole.SCOUT]: SubagentType.EXPLORE,
    };

    const suggestedSubagent = subagentMap[agent] || 'general-purpose';

    return this.formatResult({
      delegation: true,
      agent,
      agent_description: getRoleDescription(agent),
      prompt,
      suggested_action: {
        tool: 'Task',
        subagent_type: suggestedSubagent,
        prompt,
      },
      message: `API 키가 설정되지 않아 Claude Code가 직접 처리합니다. Task tool의 ${suggestedSubagent} 에이전트를 사용하세요.`,
    });
  }

  private async handleBackgroundOutput(args: unknown): Promise<ToolResult> {
    const input = BackgroundOutputInputSchema.parse(args);

    // block=false (기본): 즉시 현재 상태 반환
    if (!input.block) {
      const agent = await this.agentManager.getAgent(input.task_id);

      const result: Record<string, unknown> = {
        task_id: agent.id,
        agent: agent.role,
        status: agent.status,
      };

      if (agent.status === AgentStatus.RUNNING) {
        result.progress = {
          started_at: agent.startedAt?.toISOString(),
          elapsed_ms: agent.startedAt ? Date.now() - agent.startedAt.getTime() : 0,
        };
        result.message = '작업이 진행 중입니다...';
      } else if (agent.status === AgentStatus.QUEUED) {
        result.message = '작업이 대기 중입니다...';
      } else if (agent.status === AgentStatus.COMPLETED) {
        result.result = agent.result;
        result.execution_time_ms = agent.executionTimeMs;
        result.tokens_used = agent.tokensUsed;
        if (agent.fallbackInfo) {
          result.fallback_info = {
            original_provider: agent.fallbackInfo.originalProvider,
            used_provider: agent.fallbackInfo.usedProvider,
            reason: agent.fallbackInfo.reason,
            message: agent.fallbackInfo.message,
          };
        }
      } else if (agent.status === AgentStatus.FAILED) {
        result.error = agent.error?.message;
      } else if (agent.status === AgentStatus.TIMEOUT) {
        result.error = '작업 시간 초과';
      } else if (agent.status === AgentStatus.CANCELLED) {
        result.message = '작업이 취소되었습니다.';
      }

      return this.formatResult(result);
    }

    // block=true: 완료까지 대기
    const agentResult = await this.agentManager.waitForCompletion(
      input.task_id,
      input.timeout_ms
    );

    const response: Record<string, unknown> = {
      task_id: agentResult.agentId,
      status: agentResult.status,
      result: agentResult.result,
      error: agentResult.error?.message,
      execution_time_ms: agentResult.executionTimeMs,
      tokens_used: agentResult.tokensUsed,
    };

    if (agentResult.fallbackInfo) {
      response.fallback_info = {
        original_provider: agentResult.fallbackInfo.originalProvider,
        used_provider: agentResult.fallbackInfo.usedProvider,
        reason: agentResult.fallbackInfo.reason,
        message: agentResult.fallbackInfo.message,
      };
    }

    return this.formatResult(response);
  }

  private async handleBackgroundCancel(args: unknown): Promise<ToolResult> {
    const input = BackgroundCancelInputSchema.parse(args);

    if (input.all) {
      // 모든 실행 중인 작업 취소
      const agents = await this.agentManager.listAgents({
        sessionId: this.sessionId,
        status: [AgentStatus.RUNNING, AgentStatus.QUEUED],
      });

      const cancelPromises = agents.map((agent) =>
        this.agentManager.cancelAgent(agent.id).catch((e) => {
          this.logger.warn('Failed to cancel agent', { agentId: agent.id, error: e });
        })
      );

      await Promise.all(cancelPromises);

      this.logger.info('All background tasks cancelled', { count: agents.length });

      return this.formatResult({
        cancelled_count: agents.length,
        cancelled_task_ids: agents.map((a) => a.id),
        message: `${agents.length}개의 작업이 취소되었습니다.`,
      });
    }

    // 특정 작업만 취소
    if (input.task_id) {
      await this.agentManager.cancelAgent(input.task_id);

      return this.formatResult({
        task_id: input.task_id,
        status: 'cancelled',
        message: '작업이 취소되었습니다.',
      });
    }

    throw new ValidationError('task_id 또는 all=true 중 하나는 필수입니다');
  }

  private async handleListTasks(args: unknown): Promise<ToolResult> {
    const input = ListTasksInputSchema.parse(args);

    const agents = await this.agentManager.listAgents({
      sessionId: this.sessionId,
      status: input.filter?.status,
      role: input.filter?.agent,
    });

    const taskList = agents.map((agent) => ({
      task_id: agent.id,
      agent: agent.role,
      status: agent.status,
      prompt: agent.task.substring(0, 100) + (agent.task.length > 100 ? '...' : ''),
      created_at: agent.createdAt.toISOString(),
      execution_time_ms: agent.executionTimeMs,
    }));

    return this.formatResult({
      total: taskList.length,
      tasks: taskList,
    });
  }

  private async handleShareContext(args: unknown): Promise<ToolResult> {
    const input = ShareContextInputSchema.parse(args);

    await this.contextStore.set({
      key: input.key,
      value: input.value,
      scope: input.scope,
      sessionId: this.sessionId,
      ttlSeconds: input.ttl_seconds,
    });

    return this.formatResult({
      key: input.key,
      scope: input.scope,
      message: '컨텍스트가 저장되었습니다.',
    });
  }

  private async handleGetContext(args: unknown): Promise<ToolResult> {
    const input = GetContextInputSchema.parse(args);

    const entry = await this.contextStore.get({
      key: input.key,
      scope: input.scope,
      sessionId: this.sessionId,
    });

    return this.formatResult({
      key: entry.key,
      value: entry.value,
      scope: entry.scope,
      created_at: entry.createdAt.toISOString(),
      expires_at: entry.expiresAt?.toISOString(),
      access_count: entry.accessCount,
    });
  }


  /**
   * 의도 기반 에이전트 추천
   * LLM이 사용자 요청을 분석하여 최적 에이전트를 선택합니다.
   */
  private async handleSuggestAgent(args: unknown): Promise<ToolResult> {
    const input = SuggestAgentInputSchema.parse(args);

    // IntentAnalyzer로 의도 분석
    const analysisResult = await this.intentAnalyzer.analyze(input.query);
    const { decision, confirmationMessage, options, isFeedbackRequest, feedbackType } = analysisResult;

    // 0. 피드백/재시도 요청 처리
    if (isFeedbackRequest) {
      return this.handleFeedbackRequest(feedbackType, confirmationMessage, options);
    }

    // 1. 명시적 멘션 또는 high confidence → 바로 추천
    if (decision.confidence === 'high' && decision.agent) {
      const metadata = AGENT_METADATA[decision.agent];

      // API 키 없으면 Claude Code 위임 안내
      if (!this.modelRouter.hasAvailableProvider(decision.agent)) {
        return this.formatResult({
          suggested_agent: decision.agent,
          description: getRoleDescription(decision.agent),
          confidence: decision.confidence,
          reason: decision.reason,
          delegation_available: true,
          message: `${metadata.name}이(가) 적합합니다. API 키가 없어 Claude Code가 직접 처리할 수 있습니다.`,
          recommendation: `Claude Code를 이용하시겠어요? 또는 background_task(agent="${decision.agent}", prompt="...") 사용`,
        });
      }

      return this.formatResult({
        suggested_agent: decision.agent,
        description: getRoleDescription(decision.agent),
        cost: metadata.cost,
        confidence: decision.confidence,
        reason: decision.reason,
        is_explicit_mention: decision.isExplicitMention || false,
        recommendation: `Use background_task(agent="${decision.agent}", prompt="...") to execute this task.`,
      });
    }

    // 2. 병렬 실행 요청
    if (decision.isParallel) {
      const parallelAgents = decision.alternatives?.map((alt) => ({
        agent: alt.agent,
        description: getRoleDescription(alt.agent),
        cost: AGENT_METADATA[alt.agent].cost,
      }));

      return this.formatResult({
        suggested_agent: null,
        is_parallel_request: true,
        confidence: decision.confidence,
        reason: decision.reason,
        parallel_agents: parallelAgents,
        recommendation: '여러 에이전트를 병렬로 실행합니다. 각각 background_task를 호출하세요.',
      });
    }

    // 3. medium confidence → 확인 요청
    if (decision.confidence === 'medium' && decision.agent) {
      const metadata = AGENT_METADATA[decision.agent];
      return this.formatResult({
        suggested_agent: decision.agent,
        description: getRoleDescription(decision.agent),
        cost: metadata.cost,
        confidence: decision.confidence,
        reason: decision.reason,
        needs_confirmation: true,
        confirmation_message: confirmationMessage,
        alternatives: decision.alternatives?.map((alt) => ({
          agent: alt.agent,
          description: getRoleDescription(alt.agent),
          reason: alt.reason,
          cost: AGENT_METADATA[alt.agent].cost,
        })),
        options: [
          { label: '예', action: `background_task(agent="${decision.agent}", ...)` },
          ...(decision.alternatives?.map((alt) => ({
            label: AGENT_METADATA[alt.agent].name,
            action: `background_task(agent="${alt.agent}", ...)`,
          })) || []),
          { label: 'Claude Code가 직접 처리', action: 'Task tool 사용' },
        ],
      });
    }

    // 4. low confidence → 선택지 제공
    return this.formatResult({
      suggested_agent: null,
      confidence: 'low',
      reason: decision.reason,
      message: confirmationMessage || '어떤 에이전트가 도와드릴까요?',
      available_agents: options?.map((opt) => ({
        agent: opt.agent,
        description: opt.description,
        cost: opt.cost,
      })) || Object.entries(AGENT_METADATA).map(([role, meta]) => ({
        agent: role,
        description: getRoleDescription(role as AgentRole),
        cost: meta.cost,
      })),
    });
  }

  /**
   * 피드백/재시도 요청 처리
   */
  private handleFeedbackRequest(
    feedbackType: 'retry_same' | 'retry_different' | 'modify' | undefined,
    confirmationMessage: string | undefined,
    options?: Array<{ agent: AgentRole; description: string; cost: string }>
  ): ToolResult {
    switch (feedbackType) {
      case 'retry_same':
        return this.formatResult({
          is_feedback_request: true,
          feedback_type: 'retry_same',
          message: confirmationMessage || '이전과 같은 에이전트로 다시 시도합니다.',
          recommendation: '이전 작업의 task_id를 사용하여 같은 에이전트에게 다시 요청하거나, 새로운 프롬프트로 background_task를 호출하세요.',
          actions: [
            { label: '같은 프롬프트로 재시도', action: 'background_task(agent="<previous>", prompt="<same>")' },
            { label: '수정된 프롬프트로 시도', action: 'background_task(agent="<previous>", prompt="<modified>")' },
          ],
        });

      case 'retry_different':
        return this.formatResult({
          is_feedback_request: true,
          feedback_type: 'retry_different',
          message: confirmationMessage || '다른 에이전트로 시도해 볼까요?',
          available_agents: options || Object.entries(AGENT_METADATA).map(([role, meta]) => ({
            agent: role,
            description: getRoleDescription(role as AgentRole),
            cost: meta.cost,
          })),
          recommendation: '아래 에이전트 중 하나를 선택하여 background_task를 호출하세요.',
        });

      case 'modify':
        return this.formatResult({
          is_feedback_request: true,
          feedback_type: 'modify',
          message: confirmationMessage || '이전 결과를 어떻게 수정할까요?',
          recommendation: '수정 요청을 구체적으로 설명해주세요. 예: "더 자세히 설명해줘", "코드만 보여줘", "한국어로 번역해줘"',
          actions: [
            { label: '같은 에이전트에게 수정 요청', action: 'background_task(agent="<previous>", prompt="<수정 요청>")' },
            { label: '다른 에이전트로 처리', action: 'suggest_agent로 다른 에이전트 추천받기' },
          ],
        });

      default:
        return this.formatResult({
          is_feedback_request: true,
          message: '어떤 도움이 필요하신가요?',
          available_agents: Object.entries(AGENT_METADATA).map(([role, meta]) => ({
            agent: role,
            description: getRoleDescription(role as AgentRole),
            cost: meta.cost,
          })),
        });
    }
  }

  private formatResult(data: unknown): ToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private formatError(error: unknown): ToolResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof Error ? error.name : 'UnknownError';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: {
                code: errorCode,
                message: errorMessage,
              },
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
