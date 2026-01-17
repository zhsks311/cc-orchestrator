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
  AstSearchInputSchema,
  AstReplaceInputSchema,
} from '../tools/schemas.js';
import { getAstGrepService } from '../../core/ast/index.js';
import {
  getRoleDescription,
  AGENT_METADATA,
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
        case 'ast_search':
          return await this.handleAstSearch(args);
        case 'ast_replace':
          return await this.handleAstReplace(args);
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

    // Check API key - return delegation response if not available
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
      message: `Background task started. Check status with background_output(task_id="${agent.id}").`,
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
   * Generate delegation response to Claude Code when no API key is available
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
      message: `No API key configured. Claude Code will handle this directly. Use the Task tool with ${suggestedSubagent} agent.`,
    });
  }

  private async handleBackgroundOutput(args: unknown): Promise<ToolResult> {
    const input = BackgroundOutputInputSchema.parse(args);

    // block=false (default): return current status immediately
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
        result.message = 'Task is in progress...';
      } else if (agent.status === AgentStatus.QUEUED) {
        result.message = 'Task is queued...';
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
        result.error = 'Task timed out';
      } else if (agent.status === AgentStatus.CANCELLED) {
        result.message = 'Task was cancelled.';
      }

      return this.formatResult(result);
    }

    // block=true: wait until completion
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
      // Cancel all running tasks
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
        message: `${agents.length} task(s) cancelled.`,
      });
    }

    // Cancel specific task only
    if (input.task_id) {
      await this.agentManager.cancelAgent(input.task_id);

      return this.formatResult({
        task_id: input.task_id,
        status: 'cancelled',
        message: 'Task cancelled.',
      });
    }

    throw new ValidationError('Either task_id or all=true is required');
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
      message: 'Context saved.',
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
   * Intent-based agent recommendation
   * LLM analyzes user request to select the optimal agent.
   */
  private async handleSuggestAgent(args: unknown): Promise<ToolResult> {
    const input = SuggestAgentInputSchema.parse(args);

    // Analyze intent with IntentAnalyzer
    const analysisResult = await this.intentAnalyzer.analyze(input.query);
    const { decision, confirmationMessage, options, isFeedbackRequest, feedbackType } = analysisResult;

    // 0. Handle feedback/retry requests
    if (isFeedbackRequest) {
      return this.handleFeedbackRequest(feedbackType, confirmationMessage, options);
    }

    // 1. Explicit mention or high confidence -> recommend directly
    if (decision.confidence === 'high' && decision.agent) {
      const metadata = AGENT_METADATA[decision.agent];

      // Suggest Claude Code delegation if no API key
      if (!this.modelRouter.hasAvailableProvider(decision.agent)) {
        return this.formatResult({
          suggested_agent: decision.agent,
          description: getRoleDescription(decision.agent),
          confidence: decision.confidence,
          reason: decision.reason,
          delegation_available: true,
          message: `${metadata.name} is suitable. No API key available, so Claude Code can handle this directly.`,
          recommendation: `Would you like Claude Code to handle this? Or use background_task(agent="${decision.agent}", prompt="...")`,
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

    // 2. Parallel execution request
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
        recommendation: 'Running multiple agents in parallel. Call background_task for each.',
      });
    }

    // 3. Medium confidence -> request confirmation
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
          { label: 'Yes', action: `background_task(agent="${decision.agent}", ...)` },
          ...(decision.alternatives?.map((alt) => ({
            label: AGENT_METADATA[alt.agent].name,
            action: `background_task(agent="${alt.agent}", ...)`,
          })) || []),
          { label: 'Let Claude Code handle it', action: 'Use Task tool' },
        ],
      });
    }

    // 4. Low confidence -> provide options
    return this.formatResult({
      suggested_agent: null,
      confidence: 'low',
      reason: decision.reason,
      message: confirmationMessage || 'Which agent would you like to help you?',
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
   * Handle feedback/retry requests
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
          message: confirmationMessage || 'Retrying with the same agent.',
          recommendation: 'Use the previous task_id to request again with the same agent, or call background_task with a new prompt.',
          actions: [
            { label: 'Retry with same prompt', action: 'background_task(agent="<previous>", prompt="<same>")' },
            { label: 'Try with modified prompt', action: 'background_task(agent="<previous>", prompt="<modified>")' },
          ],
        });

      case 'retry_different':
        return this.formatResult({
          is_feedback_request: true,
          feedback_type: 'retry_different',
          message: confirmationMessage || 'Would you like to try with a different agent?',
          available_agents: options || Object.entries(AGENT_METADATA).map(([role, meta]) => ({
            agent: role,
            description: getRoleDescription(role as AgentRole),
            cost: meta.cost,
          })),
          recommendation: 'Select one of the agents below and call background_task.',
        });

      case 'modify':
        return this.formatResult({
          is_feedback_request: true,
          feedback_type: 'modify',
          message: confirmationMessage || 'How would you like to modify the previous result?',
          recommendation: 'Please describe your modification request specifically. e.g., "explain in more detail", "show only the code", "translate to Korean"',
          actions: [
            { label: 'Request modification from same agent', action: 'background_task(agent="<previous>", prompt="<modification request>")' },
            { label: 'Process with different agent', action: 'Get recommendation with suggest_agent' },
          ],
        });

      default:
        return this.formatResult({
          is_feedback_request: true,
          message: 'What kind of help do you need?',
          available_agents: Object.entries(AGENT_METADATA).map(([role, meta]) => ({
            agent: role,
            description: getRoleDescription(role as AgentRole),
            cost: meta.cost,
          })),
        });
    }
  }

  /**
   * AST-based code search
   */
  private async handleAstSearch(args: unknown): Promise<ToolResult> {
    const input = AstSearchInputSchema.parse(args);
    const astService = getAstGrepService();

    const results = await astService.search(input.pattern, {
      path: input.path,
      language: input.language,
      maxResults: input.max_results,
    });

    return this.formatResult({
      pattern: input.pattern,
      path: input.path,
      language: input.language || 'auto-detected',
      total_matches: results.length,
      matches: results.map((r) => ({
        file: r.file,
        line: r.line,
        column: r.column,
        matched_text: r.matchedText,
        context: r.context,
      })),
    });
  }

  /**
   * AST-based code replacement
   */
  private async handleAstReplace(args: unknown): Promise<ToolResult> {
    const input = AstReplaceInputSchema.parse(args);
    const astService = getAstGrepService();

    const results = await astService.replace(input.pattern, input.replacement, {
      path: input.path,
      language: input.language,
      dryRun: input.dry_run,
    });

    const totalReplacements = results.reduce((sum, r) => sum + r.replacements, 0);

    return this.formatResult({
      pattern: input.pattern,
      replacement: input.replacement,
      path: input.path,
      dry_run: input.dry_run,
      total_files_modified: results.length,
      total_replacements: totalReplacements,
      files: results.map((r) => ({
        file: r.file,
        replacements: r.replacements,
        preview: r.preview,
      })),
      message: input.dry_run
        ? `Dry run: ${totalReplacements} replacement(s) would be made in ${results.length} file(s). Set dry_run=false to apply.`
        : `Applied ${totalReplacements} replacement(s) in ${results.length} file(s).`,
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
