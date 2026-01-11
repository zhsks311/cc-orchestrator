/**
 * Provider Health Manager
 * Tracks provider health status for runtime fallback decisions
 */

import { ModelProvider, FallbackReason } from '../../types/index.js';
import { Logger } from '../../infrastructure/Logger.js';

export interface ProviderState {
  available: boolean;
  consecutiveErrors: number;
  lastError?: Date;
  lastSuccess?: Date;
  cooldownUntil?: Date;
  circuitOpen: boolean;
}

export interface HealthCheckResult {
  isHealthy: boolean;
  reason?: FallbackReason;
  cooldownRemainingMs?: number;
}

const DEFAULT_COOLDOWN_MS = 60000; // 1 minute
const MAX_CONSECUTIVE_ERRORS = 3;
const CIRCUIT_RESET_MS = 300000; // 5 minutes

export class ProviderHealthManager {
  private states: Map<ModelProvider, ProviderState> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ProviderHealthManager');
    this.initializeStates();
  }

  private initializeStates(): void {
    for (const provider of Object.values(ModelProvider)) {
      this.states.set(provider, {
        available: true,
        consecutiveErrors: 0,
        circuitOpen: false,
      });
    }
  }

  /**
   * Mark a successful request for a provider
   */
  markSuccess(provider: ModelProvider): void {
    const state = this.getState(provider);
    state.consecutiveErrors = 0;
    state.lastSuccess = new Date();
    state.circuitOpen = false;
    state.cooldownUntil = undefined;

    this.logger.debug('Provider marked healthy', { provider });
  }

  /**
   * Mark a failed request for a provider
   */
  markError(provider: ModelProvider, error: Error): FallbackReason {
    const state = this.getState(provider);
    state.consecutiveErrors++;
    state.lastError = new Date();

    const reason = this.classifyError(error);

    // Apply cooldown for rate limits
    if (reason === FallbackReason.RATE_LIMIT) {
      const retryAfter = this.parseRetryAfter(error);
      state.cooldownUntil = new Date(Date.now() + (retryAfter || DEFAULT_COOLDOWN_MS));
      this.logger.warn('Provider rate limited', {
        provider,
        cooldownUntil: state.cooldownUntil.toISOString(),
      });
    }

    // Open circuit breaker after max consecutive errors
    if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      state.circuitOpen = true;
      state.cooldownUntil = new Date(Date.now() + CIRCUIT_RESET_MS);
      this.logger.warn('Circuit breaker opened', {
        provider,
        consecutiveErrors: state.consecutiveErrors,
        resetAt: state.cooldownUntil.toISOString(),
      });
    }

    return reason;
  }

  /**
   * Check if a provider is healthy and available
   */
  checkHealth(provider: ModelProvider): HealthCheckResult {
    const state = this.getState(provider);

    // Check if in cooldown
    if (state.cooldownUntil && state.cooldownUntil > new Date()) {
      const cooldownRemainingMs = state.cooldownUntil.getTime() - Date.now();
      return {
        isHealthy: false,
        reason: state.circuitOpen ? FallbackReason.SERVER_ERROR : FallbackReason.RATE_LIMIT,
        cooldownRemainingMs,
      };
    }

    // Reset cooldown if expired
    if (state.cooldownUntil && state.cooldownUntil <= new Date()) {
      state.cooldownUntil = undefined;
      if (state.circuitOpen) {
        // Half-open state - allow one request to test
        this.logger.info('Circuit breaker half-open, allowing test request', { provider });
      }
    }

    return { isHealthy: true };
  }

  /**
   * Get the next healthy provider from a priority list
   */
  getNextHealthyProvider(providers: ModelProvider[]): ModelProvider | null {
    for (const provider of providers) {
      const health = this.checkHealth(provider);
      if (health.isHealthy) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Get cooldown remaining in milliseconds
   */
  getCooldownRemaining(provider: ModelProvider): number {
    const state = this.getState(provider);
    if (!state.cooldownUntil) return 0;
    return Math.max(0, state.cooldownUntil.getTime() - Date.now());
  }

  /**
   * Get all provider states for diagnostics
   */
  getAllStates(): Map<ModelProvider, ProviderState> {
    return new Map(this.states);
  }

  /**
   * Reset a provider's health state
   */
  reset(provider: ModelProvider): void {
    this.states.set(provider, {
      available: true,
      consecutiveErrors: 0,
      circuitOpen: false,
    });
    this.logger.info('Provider state reset', { provider });
  }

  /**
   * Reset all provider states
   */
  resetAll(): void {
    this.initializeStates();
    this.logger.info('All provider states reset');
  }

  private getState(provider: ModelProvider): ProviderState {
    let state = this.states.get(provider);
    if (!state) {
      state = {
        available: true,
        consecutiveErrors: 0,
        circuitOpen: false,
      };
      this.states.set(provider, state);
    }
    return state;
  }

  private classifyError(error: Error): FallbackReason {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Rate limit errors
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429') ||
      name.includes('ratelimit')
    ) {
      return FallbackReason.RATE_LIMIT;
    }

    // Timeout errors
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      name.includes('timeout') ||
      message.includes('econnreset')
    ) {
      return FallbackReason.TIMEOUT;
    }

    // Server errors
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('internal server error') ||
      message.includes('service unavailable')
    ) {
      return FallbackReason.SERVER_ERROR;
    }

    return FallbackReason.UNKNOWN;
  }

  private parseRetryAfter(error: Error): number | null {
    // Try to extract retry-after from error message
    const match = error.message.match(/retry[- ]?after[:\s]+(\d+)/i);
    if (match && match[1]) {
      const seconds = parseInt(match[1], 10);
      return seconds * 1000; // Convert to milliseconds
    }
    return null;
  }
}
