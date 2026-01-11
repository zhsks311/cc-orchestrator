/**
 * Tool Handlers
 * Renamed to match oh-my-opencode patterns
 */

import { IAgentManager } from '../../core/agents/AgentManager.js';
import { IContextStore } from '../../core/context/ContextStore.js';
import {
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
import { getRoleDescription, findBestAgent, AGENT_METADATA } from '../../core/agents/prompts.js';

export interface ToolHandlerDependencies {
  agentManager: IAgentManager;
  contextStore: IContextStore;
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
  private sessionId: string;
  private logger: Logger;

  constructor(deps: ToolHandlerDependencies) {
    this.agentManager = deps.agentManager;
    this.contextStore = deps.contextStore;
    this.sessionId = deps.sessionId;
    this.logger = new Logger('ToolHandlers');
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


  private handleSuggestAgent(args: unknown): ToolResult {
    const input = SuggestAgentInputSchema.parse(args);
    
    const suggestedAgent = findBestAgent(input.query);
    
    if (suggestedAgent) {
      const metadata = AGENT_METADATA[suggestedAgent];
      return this.formatResult({
        suggested_agent: suggestedAgent,
        description: getRoleDescription(suggestedAgent),
        cost: metadata.cost,
        use_when: metadata.useWhen,
        avoid_when: metadata.avoidWhen,
        matched_triggers: metadata.keyTriggers.filter(t =>
          input.query.toLowerCase().includes(t.toLowerCase())
        ),
        recommendation: `Use background_task(agent="${suggestedAgent}", prompt="...") to execute this task.`,
      });
    }
    
    // No specific agent matched - return all options
    return this.formatResult({
      suggested_agent: null,
      message: 'No specific agent matched. Here are all available agents:',
      available_agents: Object.entries(AGENT_METADATA).map(([role, meta]) => ({
        agent: role,
        description: getRoleDescription(role as any),
        cost: meta.cost,
        use_when: meta.useWhen,
      })),
    });
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
