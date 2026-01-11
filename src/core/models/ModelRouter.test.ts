/**
 * ModelRouter Tests - Cross-provider fallback functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRole, ModelProvider, FallbackReason } from '../../types/index.js';

vi.mock('./providers/OpenAIProvider.js', () => ({
  OpenAIProvider: class {
    async execute() {
      return {
        content: 'OpenAI response',
        tokensUsed: { input: 10, output: 20 },
        model: 'gpt-5.2',
        finishReason: 'stop',
      };
    }
    async executeWithTools() {
      return {
        content: 'OpenAI tool response',
        toolCalls: null,
        tokensUsed: { input: 10, output: 20 },
        model: 'gpt-5.2',
        finishReason: 'stop',
      };
    }
  },
}));

vi.mock('./providers/GoogleProvider.js', () => ({
  GoogleProvider: class {
    async execute() {
      return {
        content: 'Google response',
        tokensUsed: { input: 10, output: 20 },
        model: 'gemini-3-pro-preview',
        finishReason: 'stop',
      };
    }
    async executeWithTools() {
      return {
        content: 'Google tool response',
        toolCalls: null,
        tokensUsed: { input: 10, output: 20 },
        model: 'gemini-3-pro-preview',
        finishReason: 'stop',
      };
    }
  },
}));

vi.mock('./providers/AnthropicProvider.js', () => ({
  AnthropicProvider: class {
    async execute() {
      return {
        content: 'Anthropic response',
        tokensUsed: { input: 10, output: 20 },
        model: 'claude-opus-4',
        finishReason: 'end_turn',
      };
    }
    async executeWithTools() {
      return {
        content: 'Anthropic tool response',
        toolCalls: null,
        tokensUsed: { input: 10, output: 20 },
        model: 'claude-opus-4',
        finishReason: 'end_turn',
      };
    }
  },
}));

// Import after mocks are set up
import { ModelRouter } from './ModelRouter.js';

describe('ModelRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('Provider Availability', () => {
    it('should detect no providers when no API keys are set', () => {
      const router = new ModelRouter();

      expect(router.getAvailableProviders()).toEqual([]);
      expect(router.isProviderAvailable(ModelProvider.OPENAI)).toBe(false);
      expect(router.isProviderAvailable(ModelProvider.GOOGLE)).toBe(false);
      expect(router.isProviderAvailable(ModelProvider.ANTHROPIC)).toBe(false);
    });

    it('should detect OpenAI provider when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const router = new ModelRouter();

      expect(router.isProviderAvailable(ModelProvider.OPENAI)).toBe(true);
      expect(router.getAvailableProviders()).toContain(ModelProvider.OPENAI);
    });

    it('should detect Google provider when GOOGLE_API_KEY is set', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      const router = new ModelRouter();

      expect(router.isProviderAvailable(ModelProvider.GOOGLE)).toBe(true);
      expect(router.getAvailableProviders()).toContain(ModelProvider.GOOGLE);
    });

    it('should detect Anthropic provider when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const router = new ModelRouter();

      expect(router.isProviderAvailable(ModelProvider.ANTHROPIC)).toBe(true);
      expect(router.getAvailableProviders()).toContain(ModelProvider.ANTHROPIC);
    });

    it('should detect all providers when all API keys are set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.GOOGLE_API_KEY = 'test-key';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const router = new ModelRouter();

      expect(router.getAvailableProviders()).toHaveLength(3);
    });
  });

  describe('findAvailableProviderConfig', () => {
    it('should return primary provider config when available', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const router = new ModelRouter();

      const result = router.findAvailableProviderConfig(AgentRole.ORACLE);

      expect(result).not.toBeNull();
      expect(result!.config.provider).toBe(ModelProvider.OPENAI);
      expect(result!.fallbackInfo).toBeUndefined();
    });

    it('should return fallback provider config when primary is unavailable', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const router = new ModelRouter();

      // ORACLE primary is OpenAI, fallback is Anthropic
      const result = router.findAvailableProviderConfig(AgentRole.ORACLE);

      expect(result).not.toBeNull();
      expect(result!.config.provider).toBe(ModelProvider.ANTHROPIC);
      expect(result!.fallbackInfo).toBeDefined();
      expect(result!.fallbackInfo!.originalProvider).toBe(ModelProvider.OPENAI);
      expect(result!.fallbackInfo!.usedProvider).toBe(ModelProvider.ANTHROPIC);
      expect(result!.fallbackInfo!.reason).toBe(FallbackReason.API_KEY_MISSING);
    });

    it('should return second fallback when primary and first fallback are unavailable', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      const router = new ModelRouter();

      // ORACLE: primary=OpenAI, fallback1=Anthropic, fallback2=Google
      const result = router.findAvailableProviderConfig(AgentRole.ORACLE);

      expect(result).not.toBeNull();
      expect(result!.config.provider).toBe(ModelProvider.GOOGLE);
      expect(result!.fallbackInfo!.reason).toBe(FallbackReason.API_KEY_MISSING);
    });

    it('should return null when no provider is available', () => {
      const router = new ModelRouter();

      const result = router.findAvailableProviderConfig(AgentRole.ORACLE);

      expect(result).toBeNull();
    });
  });

  describe('executeWithFallback - Cross-provider', () => {
    it('should execute with primary provider when available', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const router = new ModelRouter();

      const response = await router.executeWithFallback({
        role: AgentRole.ORACLE,
        task: 'Test task',
      });

      expect(response.content).toBe('OpenAI response');
      expect(response.fallbackInfo).toBeUndefined();
    });

    it('should execute with fallback provider when primary is unavailable', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const router = new ModelRouter();

      const response = await router.executeWithFallback({
        role: AgentRole.ORACLE,
        task: 'Test task',
      });

      expect(response.content).toBe('Anthropic response');
      expect(response.fallbackInfo).toBeDefined();
      expect(response.fallbackInfo!.originalProvider).toBe(ModelProvider.OPENAI);
      expect(response.fallbackInfo!.usedProvider).toBe(ModelProvider.ANTHROPIC);
    });

    it('should throw error when no provider is available', async () => {
      const router = new ModelRouter();

      await expect(router.executeWithFallback({
        role: AgentRole.ORACLE,
        task: 'Test task',
      })).rejects.toThrow('No available provider');
    });
  });

  describe('Role-specific fallback chains', () => {
    it('LIBRARIAN should fallback from Anthropic to OpenAI', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const router = new ModelRouter();

      // LIBRARIAN primary is Anthropic
      const result = router.findAvailableProviderConfig(AgentRole.LIBRARIAN);

      expect(result!.config.provider).toBe(ModelProvider.OPENAI);
      expect(result!.fallbackInfo!.originalProvider).toBe(ModelProvider.ANTHROPIC);
    });

    it('FRONTEND_ENGINEER should fallback from Google to Anthropic', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const router = new ModelRouter();

      // FRONTEND_ENGINEER primary is Google
      const result = router.findAvailableProviderConfig(AgentRole.FRONTEND_ENGINEER);

      expect(result!.config.provider).toBe(ModelProvider.ANTHROPIC);
      expect(result!.fallbackInfo!.originalProvider).toBe(ModelProvider.GOOGLE);
    });

    it('EXPLORE should fallback from Anthropic to Google', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      const router = new ModelRouter();

      // EXPLORE primary is Anthropic
      const result = router.findAvailableProviderConfig(AgentRole.EXPLORE);

      expect(result!.config.provider).toBe(ModelProvider.GOOGLE);
      expect(result!.fallbackInfo!.originalProvider).toBe(ModelProvider.ANTHROPIC);
    });
  });
});
