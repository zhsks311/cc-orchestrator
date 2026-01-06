/**
 * Model Router - Routes tasks to appropriate model providers based on agent role
 */

import {
  AgentRole,
  ModelProvider,
  ModelConfig,
  ExecuteTaskParams,
  ModelResponse,
  ROLE_MODEL_MAPPING,
  ToolDefinition,
  ToolUseResponse,
  Message,
} from '../../types/index.js';
import { ModelAPIError } from '../../types/errors.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { getSystemPromptForRole } from '../agents/prompts.js';
import { Logger } from '../../infrastructure/Logger.js';

export interface ExecuteWithToolsParams {
  role: AgentRole;
  systemPrompt?: string;
  messages: Message[];
  tools: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface IModelRouter {
  executeTask(params: ExecuteTaskParams): Promise<ModelResponse>;
  getModelForRole(role: AgentRole): ModelConfig;
  executeWithFallback(params: ExecuteTaskParams): Promise<ModelResponse>;
  executeWithTools(params: ExecuteWithToolsParams): Promise<ToolUseResponse>;
}

export class ModelRouter implements IModelRouter {
  private openaiProvider?: OpenAIProvider;
  private googleProvider?: GoogleProvider;
  private anthropicProvider?: AnthropicProvider;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ModelRouter');
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize providers only if API keys are available
    if (process.env.OPENAI_API_KEY) {
      try {
        this.openaiProvider = new OpenAIProvider();
        this.logger.info('OpenAI provider initialized');
      } catch (error) {
        this.logger.warn('Failed to initialize OpenAI provider', { error });
      }
    }

    if (process.env.GOOGLE_API_KEY) {
      try {
        this.googleProvider = new GoogleProvider();
        this.logger.info('Google provider initialized');
      } catch (error) {
        this.logger.warn('Failed to initialize Google provider', { error });
      }
    }

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        this.anthropicProvider = new AnthropicProvider();
        this.logger.info('Anthropic provider initialized');
      } catch (error) {
        this.logger.warn('Failed to initialize Anthropic provider', { error });
      }
    }
  }

  getModelForRole(role: AgentRole): ModelConfig {
    return ROLE_MODEL_MAPPING[role];
  }

  async executeTask(params: ExecuteTaskParams): Promise<ModelResponse> {
    const modelConfig = this.getModelForRole(params.role);
    const systemPrompt =
      params.systemPrompt ?? getSystemPromptForRole(params.role);

    const userPrompt = this.buildUserPrompt(params.task, params.context);

    const startTime = Date.now();

    try {
      const response = await this.callProvider(
        modelConfig.provider,
        modelConfig.model,
        systemPrompt,
        userPrompt,
        params.temperature ?? modelConfig.temperature,
        params.maxTokens ?? modelConfig.maxTokens
      );

      this.logger.info('Task executed successfully', {
        role: params.role,
        provider: modelConfig.provider,
        model: modelConfig.model,
        durationMs: Date.now() - startTime,
        tokensUsed: response.tokensUsed,
      });

      return response;
    } catch (error) {
      this.logger.error('Task execution failed', {
        role: params.role,
        provider: modelConfig.provider,
        model: modelConfig.model,
        error,
      });
      throw error;
    }
  }

  async executeWithFallback(params: ExecuteTaskParams): Promise<ModelResponse> {
    const modelConfig = this.getModelForRole(params.role);

    try {
      return await this.executeTask(params);
    } catch (error) {
      if (modelConfig.fallbackModel && error instanceof ModelAPIError) {
        this.logger.warn('Primary model failed, trying fallback', {
          role: params.role,
          primaryModel: modelConfig.model,
          fallbackModel: modelConfig.fallbackModel,
        });

        const systemPrompt =
          params.systemPrompt ?? getSystemPromptForRole(params.role);
        const userPrompt = this.buildUserPrompt(params.task, params.context);

        return this.callProvider(
          modelConfig.provider,
          modelConfig.fallbackModel,
          systemPrompt,
          userPrompt,
          params.temperature ?? modelConfig.temperature,
          params.maxTokens ?? modelConfig.maxTokens
        );
      }

      throw error;
    }
  }

  private async callProvider(
    provider: ModelProvider,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<ModelResponse> {
    const executeParams = {
      model,
      systemPrompt,
      userPrompt,
      temperature,
      maxTokens,
    };

    switch (provider) {
      case ModelProvider.OPENAI:
        if (!this.openaiProvider) {
          throw new ModelAPIError('OpenAI provider not initialized', 'openai');
        }
        return this.openaiProvider.execute(executeParams);

      case ModelProvider.GOOGLE:
        if (!this.googleProvider) {
          throw new ModelAPIError('Google provider not initialized', 'google');
        }
        return this.googleProvider.execute(executeParams);

      case ModelProvider.ANTHROPIC:
        if (!this.anthropicProvider) {
          throw new ModelAPIError(
            'Anthropic provider not initialized',
            'anthropic'
          );
        }
        return this.anthropicProvider.execute(executeParams);

      default:
        throw new ModelAPIError(`Unknown provider: ${provider}`, provider);
    }
  }

  private buildUserPrompt(
    task: string,
    context?: Record<string, unknown>
  ): string {
    if (!context || Object.keys(context).length === 0) {
      return task;
    }

    const contextStr = JSON.stringify(context, null, 2);
    return `## Context\n\`\`\`json\n${contextStr}\n\`\`\`\n\n## Task\n${task}`;
  }

  /**
   * Execute with tool use capability
   * Used by SisyphusExecutor for multi-turn tool calling
   */
  async executeWithTools(params: ExecuteWithToolsParams): Promise<ToolUseResponse> {
    const modelConfig = this.getModelForRole(params.role);
    const systemPrompt = params.systemPrompt ?? getSystemPromptForRole(params.role);

    const startTime = Date.now();

    try {
      const response = await this.callProviderWithTools(
        modelConfig.provider,
        modelConfig.model,
        systemPrompt,
        params.messages,
        params.tools,
        params.temperature ?? modelConfig.temperature,
        params.maxTokens ?? modelConfig.maxTokens
      );

      this.logger.info('Tool use executed successfully', {
        role: params.role,
        provider: modelConfig.provider,
        model: modelConfig.model,
        durationMs: Date.now() - startTime,
        hasToolCalls: response.toolCalls !== null,
        tokensUsed: response.tokensUsed,
      });

      return response;
    } catch (error) {
      // Try fallback model
      if (modelConfig.fallbackModel && error instanceof ModelAPIError) {
        this.logger.warn('Primary model failed for tool use, trying fallback', {
          role: params.role,
          primaryModel: modelConfig.model,
          fallbackModel: modelConfig.fallbackModel,
        });

        return this.callProviderWithTools(
          modelConfig.provider,
          modelConfig.fallbackModel,
          systemPrompt,
          params.messages,
          params.tools,
          params.temperature ?? modelConfig.temperature,
          params.maxTokens ?? modelConfig.maxTokens
        );
      }

      this.logger.error('Tool use execution failed', {
        role: params.role,
        provider: modelConfig.provider,
        model: modelConfig.model,
        error,
      });
      throw error;
    }
  }

  private async callProviderWithTools(
    provider: ModelProvider,
    model: string,
    systemPrompt: string,
    messages: Message[],
    tools: ToolDefinition[],
    temperature: number,
    maxTokens: number
  ): Promise<ToolUseResponse> {
    const executeParams = {
      model,
      systemPrompt,
      messages,
      tools,
      temperature,
      maxTokens,
    };

    switch (provider) {
      case ModelProvider.OPENAI:
        if (!this.openaiProvider) {
          throw new ModelAPIError('OpenAI provider not initialized', 'openai');
        }
        return this.openaiProvider.executeWithTools(executeParams);

      case ModelProvider.GOOGLE:
        if (!this.googleProvider) {
          throw new ModelAPIError('Google provider not initialized', 'google');
        }
        return this.googleProvider.executeWithTools(executeParams);

      case ModelProvider.ANTHROPIC:
        if (!this.anthropicProvider) {
          throw new ModelAPIError(
            'Anthropic provider not initialized',
            'anthropic'
          );
        }
        return this.anthropicProvider.executeWithTools(executeParams);

      default:
        throw new ModelAPIError(`Unknown provider: ${provider}`, provider);
    }
  }
}
