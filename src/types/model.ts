/**
 * Model Provider Types
 */

import { AgentRole } from './agent.js';

export enum ModelProvider {
  OPENAI = 'openai',
  GOOGLE = 'google',
  ANTHROPIC = 'anthropic',
}

/**
 * Cross-provider fallback configuration
 */
export interface ProviderModelConfig {
  provider: ModelProvider;
  model: string;
  fallbackModel?: string;
}

/**
 * Reason for provider fallback
 */
export enum FallbackReason {
  API_KEY_MISSING = 'api_key_missing',
  RATE_LIMIT = 'rate_limit',
  SERVER_ERROR = 'server_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

/**
 * Information about fallback that occurred
 */
export interface FallbackInfo {
  originalProvider: ModelProvider;
  usedProvider: ModelProvider;
  reason: FallbackReason;
  message?: string;
}

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  fallbackModel?: string;
  /** Cross-provider fallbacks when primary provider is unavailable */
  providerFallbacks?: ProviderModelConfig[];
  maxTokens: number;
  temperature: number;
  rateLimitPerMinute: number;
}

export interface ExecuteTaskParams {
  role: AgentRole;
  task: string;
  context?: Record<string, unknown>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelResponse {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  model: string;
  finishReason: string;
  metadata?: Record<string, unknown>;
  /** Present if a provider fallback occurred */
  fallbackInfo?: FallbackInfo;
}

/**
 * Role-to-Model Mapping Configuration
 * Based on Oh My OpenCode / PRD specifications
 */
export const ROLE_MODEL_MAPPING: Record<AgentRole, ModelConfig> = {
  [AgentRole.ARCH]: {
    provider: ModelProvider.OPENAI,
    model: 'gpt-5.2',
    fallbackModel: 'gpt-5-mini',
    providerFallbacks: [
      {
        provider: ModelProvider.ANTHROPIC,
        model: 'claude-opus-4-20250514',
        fallbackModel: 'claude-sonnet-4-20250514',
      },
      {
        provider: ModelProvider.GOOGLE,
        model: 'gemini-2.5-pro-preview-06-05',
        fallbackModel: 'gemini-2.5-flash-preview-05-20',
      },
    ],
    maxTokens: 16000,
    temperature: 0.7,
    rateLimitPerMinute: 60,
  },
  [AgentRole.CANVAS]: {
    provider: ModelProvider.GOOGLE,
    model: 'gemini-3-pro-preview',
    fallbackModel: 'gemini-3-flash-preview',
    providerFallbacks: [
      {
        provider: ModelProvider.ANTHROPIC,
        model: 'claude-sonnet-4-20250514',
        fallbackModel: 'claude-3-5-sonnet-latest',
      },
      { provider: ModelProvider.OPENAI, model: 'gpt-4o', fallbackModel: 'gpt-4o-mini' },
    ],
    maxTokens: 8000,
    temperature: 0.5,
    rateLimitPerMinute: 100,
  },
  [AgentRole.INDEX]: {
    provider: ModelProvider.ANTHROPIC,
    model: 'claude-sonnet-4-5-20250929',
    fallbackModel: 'claude-sonnet-4-20250514',
    providerFallbacks: [
      { provider: ModelProvider.OPENAI, model: 'gpt-4o', fallbackModel: 'gpt-4o-mini' },
      {
        provider: ModelProvider.GOOGLE,
        model: 'gemini-2.5-pro-preview-06-05',
        fallbackModel: 'gemini-2.5-flash-preview-05-20',
      },
    ],
    maxTokens: 32000,
    temperature: 0.3,
    rateLimitPerMinute: 80,
  },
  [AgentRole.QUILL]: {
    provider: ModelProvider.GOOGLE,
    model: 'gemini-3-pro-preview',
    fallbackModel: 'gemini-3-flash-preview',
    providerFallbacks: [
      {
        provider: ModelProvider.ANTHROPIC,
        model: 'claude-sonnet-4-20250514',
        fallbackModel: 'claude-3-5-sonnet-latest',
      },
      { provider: ModelProvider.OPENAI, model: 'gpt-4o', fallbackModel: 'gpt-4o-mini' },
    ],
    maxTokens: 16000,
    temperature: 0.6,
    rateLimitPerMinute: 100,
  },
  [AgentRole.LENS]: {
    provider: ModelProvider.GOOGLE,
    model: 'gemini-3-pro-preview',
    fallbackModel: 'gemini-3-flash-preview',
    providerFallbacks: [
      {
        provider: ModelProvider.ANTHROPIC,
        model: 'claude-sonnet-4-20250514',
        fallbackModel: 'claude-3-5-sonnet-latest',
      },
      { provider: ModelProvider.OPENAI, model: 'gpt-4o', fallbackModel: 'gpt-4o-mini' },
    ],
    maxTokens: 8000,
    temperature: 0.4,
    rateLimitPerMinute: 150,
  },
  [AgentRole.SCOUT]: {
    provider: ModelProvider.ANTHROPIC,
    model: 'claude-3-5-sonnet-latest',
    fallbackModel: 'claude-3-haiku-latest',
    providerFallbacks: [
      {
        provider: ModelProvider.GOOGLE,
        model: 'gemini-2.5-flash-preview-05-20',
        fallbackModel: 'gemini-2.0-flash',
      },
      { provider: ModelProvider.OPENAI, model: 'gpt-4o-mini', fallbackModel: 'gpt-4o-mini' },
    ],
    maxTokens: 8000,
    temperature: 0.1,
    rateLimitPerMinute: 100,
  },
};
