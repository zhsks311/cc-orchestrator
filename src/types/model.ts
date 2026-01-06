/**
 * Model Provider Types
 */

import { AgentRole } from './agent.js';

export enum ModelProvider {
  OPENAI = 'openai',
  GOOGLE = 'google',
  ANTHROPIC = 'anthropic',
}

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  fallbackModel?: string;
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
}

/**
 * Role-to-Model Mapping Configuration
 * Based on Oh My OpenCode / PRD specifications
 */
export const ROLE_MODEL_MAPPING: Record<AgentRole, ModelConfig> = {
  [AgentRole.ORACLE]: {
    provider: ModelProvider.OPENAI,
    model: 'gpt-5.2',
    fallbackModel: 'gpt-5-mini',
    maxTokens: 16000,
    temperature: 0.7,
    rateLimitPerMinute: 60,
  },
  [AgentRole.FRONTEND_ENGINEER]: {
    provider: ModelProvider.GOOGLE,
    model: 'gemini-3-pro-preview',
    fallbackModel: 'gemini-3-flash-preview',
    maxTokens: 8000,
    temperature: 0.5,
    rateLimitPerMinute: 100,
  },
  [AgentRole.LIBRARIAN]: {
    provider: ModelProvider.ANTHROPIC,
    model: 'claude-sonnet-4-5-20250929',
    fallbackModel: 'claude-sonnet-4-20250514',
    maxTokens: 32000,
    temperature: 0.3,
    rateLimitPerMinute: 80,
  },
  [AgentRole.DOCUMENT_WRITER]: {
    provider: ModelProvider.GOOGLE,
    model: 'gemini-3-pro-preview',
    fallbackModel: 'gemini-3-flash-preview',
    maxTokens: 16000,
    temperature: 0.6,
    rateLimitPerMinute: 100,
  },
  [AgentRole.MULTIMODAL_ANALYZER]: {
    provider: ModelProvider.GOOGLE,
    model: 'gemini-3-flash-preview',
    fallbackModel: 'gemini-3-pro-image-preview',
    maxTokens: 8000,
    temperature: 0.4,
    rateLimitPerMinute: 150,
  },
  [AgentRole.EXPLORE]: {
    provider: ModelProvider.ANTHROPIC,
    model: 'claude-3-5-sonnet-latest',
    fallbackModel: 'claude-3-haiku-latest',
    maxTokens: 8000,
    temperature: 0.1,
    rateLimitPerMinute: 100,
  },
};
