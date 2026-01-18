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
  FallbackReason,
  FallbackInfo,
  ProviderModelConfig,
} from '../../types/index.js';
import { ModelAPIError } from '../../types/errors.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { ProviderHealthManager } from './ProviderHealthManager.js';
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
  hasAvailableProvider(role: AgentRole): boolean;
}

export class ModelRouter implements IModelRouter {
  private openaiProvider?: OpenAIProvider;
  private googleProvider?: GoogleProvider;
  private anthropicProvider?: AnthropicProvider;
  private healthManager: ProviderHealthManager;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ModelRouter');
    this.healthManager = new ProviderHealthManager();
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

    // Log available providers summary
    const available = this.getAvailableProviders();
    if (available.length === 0) {
      this.logger.warn(
        'No providers available. Set at least one API key: OPENAI_API_KEY, GOOGLE_API_KEY, or ANTHROPIC_API_KEY'
      );
    } else {
      this.logger.info('Available providers', { providers: available });
    }
  }

  /**
   * Check if a specific provider is available (has API key)
   */
  isProviderAvailable(provider: ModelProvider): boolean {
    switch (provider) {
      case ModelProvider.OPENAI:
        return !!this.openaiProvider;
      case ModelProvider.GOOGLE:
        return !!this.googleProvider;
      case ModelProvider.ANTHROPIC:
        return !!this.anthropicProvider;
      default:
        return false;
    }
  }

  /**
   * Check if there's an available provider for a specific role
   * Returns true if at least one provider with an API key is available
   */
  hasAvailableProvider(role: AgentRole): boolean {
    const config = this.findAvailableProviderConfig(role, false);
    return config !== null;
  }

  /**
   * Check if a provider is both available AND healthy (not rate limited, circuit not open)
   */
  isProviderHealthy(provider: ModelProvider): boolean {
    if (!this.isProviderAvailable(provider)) {
      return false;
    }
    return this.healthManager.checkHealth(provider).isHealthy;
  }

  /**
   * Get the health manager for diagnostics
   */
  getHealthManager(): ProviderHealthManager {
    return this.healthManager;
  }

  /**
   * Get list of all available providers
   */
  getAvailableProviders(): ModelProvider[] {
    const available: ModelProvider[] = [];
    if (this.openaiProvider) available.push(ModelProvider.OPENAI);
    if (this.googleProvider) available.push(ModelProvider.GOOGLE);
    if (this.anthropicProvider) available.push(ModelProvider.ANTHROPIC);
    return available;
  }

  getModelForRole(role: AgentRole): ModelConfig {
    return ROLE_MODEL_MAPPING[role];
  }

  /**
   * Find an available and healthy provider for the given role
   * Returns the primary provider if available and healthy, otherwise searches providerFallbacks
   * @param checkHealth - if true, also checks provider health status (rate limits, circuit breaker)
   */
  findAvailableProviderConfig(
    role: AgentRole,
    checkHealth: boolean = false
  ): {
    config: ProviderModelConfig;
    fallbackInfo?: FallbackInfo;
  } | null {
    const modelConfig = this.getModelForRole(role);

    const isUsable = (provider: ModelProvider): boolean => {
      if (!this.isProviderAvailable(provider)) return false;
      if (checkHealth && !this.healthManager.checkHealth(provider).isHealthy) return false;
      return true;
    };

    // Try primary provider first
    if (isUsable(modelConfig.provider)) {
      return {
        config: {
          provider: modelConfig.provider,
          model: modelConfig.model,
          fallbackModel: modelConfig.fallbackModel,
        },
      };
    }

    // Determine reason for fallback
    const primaryHealthCheck = this.healthManager.checkHealth(modelConfig.provider);
    const fallbackReason = !this.isProviderAvailable(modelConfig.provider)
      ? FallbackReason.API_KEY_MISSING
      : (primaryHealthCheck.reason ?? FallbackReason.UNKNOWN);

    // Try provider fallbacks
    if (modelConfig.providerFallbacks) {
      for (const fallback of modelConfig.providerFallbacks) {
        if (isUsable(fallback.provider)) {
          return {
            config: fallback,
            fallbackInfo: {
              originalProvider: modelConfig.provider,
              usedProvider: fallback.provider,
              reason: fallbackReason,
              message: `${modelConfig.provider} not available, using ${fallback.provider}`,
            },
          };
        }
      }
    }

    return null;
  }

  async executeTask(params: ExecuteTaskParams): Promise<ModelResponse> {
    const modelConfig = this.getModelForRole(params.role);
    const systemPrompt = params.systemPrompt ?? getSystemPromptForRole(params.role);

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
    const systemPrompt = params.systemPrompt ?? getSystemPromptForRole(params.role);
    const userPrompt = this.buildUserPrompt(params.task, params.context);

    // Find an available provider (primary or fallback)
    const availableConfig = this.findAvailableProviderConfig(params.role);
    if (!availableConfig) {
      throw new ModelAPIError(
        `No available provider for role ${params.role}. Available providers: ${this.getAvailableProviders().join(', ') || 'none'}`,
        'no_provider'
      );
    }

    const { config: providerConfig, fallbackInfo } = availableConfig;

    // Log if using a fallback provider
    if (fallbackInfo) {
      this.logger.warn('Using provider fallback', {
        role: params.role,
        originalProvider: fallbackInfo.originalProvider,
        usedProvider: fallbackInfo.usedProvider,
        reason: fallbackInfo.reason,
      });
    }

    try {
      // Try primary model of the selected provider
      const response = await this.callProvider(
        providerConfig.provider,
        providerConfig.model,
        systemPrompt,
        userPrompt,
        params.temperature ?? modelConfig.temperature,
        params.maxTokens ?? modelConfig.maxTokens
      );

      // Attach fallback info if provider fallback occurred
      if (fallbackInfo) {
        response.fallbackInfo = fallbackInfo;
      }

      return response;
    } catch (error) {
      // Try fallback model within the same provider
      if (providerConfig.fallbackModel && error instanceof ModelAPIError) {
        this.logger.warn('Primary model failed, trying fallback model', {
          role: params.role,
          provider: providerConfig.provider,
          primaryModel: providerConfig.model,
          fallbackModel: providerConfig.fallbackModel,
        });

        const response = await this.callProvider(
          providerConfig.provider,
          providerConfig.fallbackModel,
          systemPrompt,
          userPrompt,
          params.temperature ?? modelConfig.temperature,
          params.maxTokens ?? modelConfig.maxTokens
        );

        // Attach fallback info if provider fallback occurred
        if (fallbackInfo) {
          response.fallbackInfo = fallbackInfo;
        }

        return response;
      }

      // Try next provider in fallback chain
      if (modelConfig.providerFallbacks && error instanceof ModelAPIError) {
        const currentProviderIndex = modelConfig.providerFallbacks.findIndex(
          (f) => f.provider === providerConfig.provider
        );
        const remainingFallbacks = modelConfig.providerFallbacks.slice(currentProviderIndex + 1);

        for (const nextFallback of remainingFallbacks) {
          if (this.isProviderAvailable(nextFallback.provider)) {
            this.logger.warn('Provider failed, trying next provider', {
              role: params.role,
              failedProvider: providerConfig.provider,
              nextProvider: nextFallback.provider,
            });

            try {
              const response = await this.callProvider(
                nextFallback.provider,
                nextFallback.model,
                systemPrompt,
                userPrompt,
                params.temperature ?? modelConfig.temperature,
                params.maxTokens ?? modelConfig.maxTokens
              );

              response.fallbackInfo = {
                originalProvider: modelConfig.provider,
                usedProvider: nextFallback.provider,
                reason: FallbackReason.SERVER_ERROR,
                message: `${providerConfig.provider} failed, using ${nextFallback.provider}`,
              };

              return response;
            } catch (nextError) {
              this.logger.warn('Next provider also failed', {
                provider: nextFallback.provider,
                error: nextError,
              });
              continue;
            }
          }
        }
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

    try {
      let response: ModelResponse;

      switch (provider) {
        case ModelProvider.OPENAI:
          if (!this.openaiProvider) {
            throw new ModelAPIError('OpenAI provider not initialized', 'openai');
          }
          response = await this.openaiProvider.execute(executeParams);
          break;

        case ModelProvider.GOOGLE:
          if (!this.googleProvider) {
            throw new ModelAPIError('Google provider not initialized', 'google');
          }
          response = await this.googleProvider.execute(executeParams);
          break;

        case ModelProvider.ANTHROPIC:
          if (!this.anthropicProvider) {
            throw new ModelAPIError('Anthropic provider not initialized', 'anthropic');
          }
          response = await this.anthropicProvider.execute(executeParams);
          break;

        default:
          throw new ModelAPIError(`Unknown provider: ${provider}`, provider);
      }

      // Mark success
      this.healthManager.markSuccess(provider);
      return response;
    } catch (error) {
      // Mark error and classify it
      if (error instanceof Error) {
        this.healthManager.markError(provider, error);
      }
      throw error;
    }
  }

  private buildUserPrompt(task: string, context?: Record<string, unknown>): string {
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
          throw new ModelAPIError('Anthropic provider not initialized', 'anthropic');
        }
        return this.anthropicProvider.executeWithTools(executeParams);

      default:
        throw new ModelAPIError(`Unknown provider: ${provider}`, provider);
    }
  }
}
