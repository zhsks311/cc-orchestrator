import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderHealthManager } from '../../src/core/models/ProviderHealthManager.js';
import { ModelProvider, FallbackReason } from '../../src/types/index.js';
import { CircuitState } from '../../src/types/circuit-breaker.js';

describe('Circuit Breaker Integration', () => {
  let healthManager: ProviderHealthManager;

  beforeEach(() => {
    healthManager = new ProviderHealthManager();
  });

  describe('Provider failure and recovery', () => {
    it('should open circuit after consecutive failures', () => {
      const provider = ModelProvider.OPENAI;

      for (let i = 0; i < 5; i++) {
        const reason = healthManager.markError(provider, new Error('API Error'));
        expect(reason).toBeDefined();
      }

      const health = healthManager.checkHealth(provider);
      expect(health.isHealthy).toBe(false);
      expect(health.reason).toBe(FallbackReason.SERVER_ERROR);

      const states = healthManager.getAllStates();
      const openaiState = states.get(provider);
      expect(openaiState?.circuitOpen).toBe(true);
      expect(openaiState?.circuitState).toBe(CircuitState.OPEN);
    });

    it('should allow fallback to healthy provider', () => {
      const failedProvider = ModelProvider.OPENAI;
      const healthyProvider = ModelProvider.ANTHROPIC;

      for (let i = 0; i < 5; i++) {
        healthManager.markError(failedProvider, new Error('API Error'));
      }

      const failedHealth = healthManager.checkHealth(failedProvider);
      expect(failedHealth.isHealthy).toBe(false);

      const healthyHealth = healthManager.checkHealth(healthyProvider);
      expect(healthyHealth.isHealthy).toBe(true);

      const nextHealthy = healthManager.getNextHealthyProvider([failedProvider, healthyProvider]);
      expect(nextHealthy).toBe(healthyProvider);
    });

    it('should reset circuit on success', () => {
      const provider = ModelProvider.OPENAI;

      for (let i = 0; i < 5; i++) {
        healthManager.markError(provider, new Error('API Error'));
      }

      let health = healthManager.checkHealth(provider);
      expect(health.isHealthy).toBe(false);

      healthManager.reset(provider);

      health = healthManager.checkHealth(provider);
      expect(health.isHealthy).toBe(true);

      const states = healthManager.getAllStates();
      const state = states.get(provider);
      expect(state?.circuitOpen).toBe(false);
      expect(state?.circuitState).toBe(CircuitState.CLOSED);
    });

    it('should track metrics across multiple providers', () => {
      healthManager.markError(ModelProvider.OPENAI, new Error('Error 1'));
      healthManager.markError(ModelProvider.OPENAI, new Error('Error 2'));
      healthManager.markError(ModelProvider.GOOGLE, new Error('Error 3'));
      healthManager.markSuccess(ModelProvider.ANTHROPIC);

      const states = healthManager.getAllStates();

      const openaiState = states.get(ModelProvider.OPENAI);
      expect(openaiState?.consecutiveErrors).toBe(2);

      const googleState = states.get(ModelProvider.GOOGLE);
      expect(googleState?.consecutiveErrors).toBe(1);

      const anthropicState = states.get(ModelProvider.ANTHROPIC);
      expect(anthropicState?.consecutiveErrors).toBe(0);
      expect(anthropicState?.lastSuccess).toBeDefined();
    });
  });

  describe('Rate limiting', () => {
    it('should handle rate limit errors separately', () => {
      const provider = ModelProvider.OPENAI;
      const rateLimitError = new Error('Rate limit exceeded (429)');

      const reason = healthManager.markError(provider, rateLimitError);
      expect(reason).toBe(FallbackReason.RATE_LIMIT);

      const health = healthManager.checkHealth(provider);
      expect(health.isHealthy).toBe(false);
      expect(health.reason).toBe(FallbackReason.RATE_LIMIT);
      expect(health.cooldownRemainingMs).toBeGreaterThan(0);
    });
  });

  describe('Multiple provider fallback chain', () => {
    it('should find healthy provider in fallback chain', () => {
      for (let i = 0; i < 5; i++) {
        healthManager.markError(ModelProvider.OPENAI, new Error('Error'));
      }

      for (let i = 0; i < 5; i++) {
        healthManager.markError(ModelProvider.GOOGLE, new Error('Error'));
      }

      const chain = [ModelProvider.OPENAI, ModelProvider.GOOGLE, ModelProvider.ANTHROPIC];

      const healthy = healthManager.getNextHealthyProvider(chain);
      expect(healthy).toBe(ModelProvider.ANTHROPIC);
    });

    it('should return null if all providers unhealthy', () => {
      const providers = [ModelProvider.OPENAI, ModelProvider.GOOGLE, ModelProvider.ANTHROPIC];

      for (const provider of providers) {
        for (let i = 0; i < 5; i++) {
          healthManager.markError(provider, new Error('Error'));
        }
      }

      const healthy = healthManager.getNextHealthyProvider(providers);
      expect(healthy).toBeNull();
    });
  });

  describe('Cooldown management', () => {
    it('should track cooldown remaining time', () => {
      const provider = ModelProvider.OPENAI;

      for (let i = 0; i < 5; i++) {
        healthManager.markError(provider, new Error('Error'));
      }

      const cooldown = healthManager.getCooldownRemaining(provider);
      expect(cooldown).toBeGreaterThan(0);
      expect(cooldown).toBeLessThanOrEqual(300000);
    });
  });

  describe('Reset all providers', () => {
    it('should reset all provider states', () => {
      for (let i = 0; i < 5; i++) {
        healthManager.markError(ModelProvider.OPENAI, new Error('Error'));
        healthManager.markError(ModelProvider.GOOGLE, new Error('Error'));
      }

      let openaiHealth = healthManager.checkHealth(ModelProvider.OPENAI);
      let googleHealth = healthManager.checkHealth(ModelProvider.GOOGLE);
      expect(openaiHealth.isHealthy).toBe(false);
      expect(googleHealth.isHealthy).toBe(false);

      healthManager.resetAll();

      openaiHealth = healthManager.checkHealth(ModelProvider.OPENAI);
      googleHealth = healthManager.checkHealth(ModelProvider.GOOGLE);
      expect(openaiHealth.isHealthy).toBe(true);
      expect(googleHealth.isHealthy).toBe(true);
    });
  });
});
