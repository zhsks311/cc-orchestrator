/**
 * Retry Strategy - Exponential backoff retry utility
 */

import { CCOError } from '../types/errors.js';
import { Logger } from './Logger.js';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Add jitter to prevent thundering herd (default: true) */
  jitter: boolean;
  /** Only retry if error is retryable (default: true) */
  respectRetryable: boolean;
  /** Custom retry condition (optional) */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Callback on each retry attempt (optional) */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  respectRetryable: true,
};

export class RetryStrategy {
  private options: RetryOptions;
  private logger: Logger;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = new Logger('RetryStrategy');
  }

  /**
   * Execute a function with exponential backoff retry
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= this.options.maxRetries) {
      try {
        const result = await fn();

        if (attempt > 0) {
          this.logger.info('Retry succeeded', {
            attempt,
            totalTimeMs: Date.now() - startTime,
          });
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        // Check if we should retry
        if (!this.shouldRetry(lastError, attempt)) {
          this.logger.debug('Not retrying - condition not met', {
            attempt,
            error: lastError.message,
            isRetryable: this.isRetryable(lastError),
          });
          throw lastError;
        }

        // Check if we've exhausted retries
        if (attempt > this.options.maxRetries) {
          this.logger.warn('Max retries exhausted', {
            maxRetries: this.options.maxRetries,
            totalTimeMs: Date.now() - startTime,
            error: lastError.message,
          });
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delayMs = this.calculateDelay(attempt);

        // Call onRetry callback if provided
        if (this.options.onRetry) {
          this.options.onRetry(lastError, attempt, delayMs);
        }

        this.logger.info('Retrying after error', {
          attempt,
          delayMs,
          error: lastError.message,
          errorCode: lastError instanceof CCOError ? lastError.code : undefined,
        });

        // Wait before retrying
        await this.sleep(delayMs);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError ?? new Error('Retry failed with unknown error');
  }

  /**
   * Execute with detailed result (doesn't throw)
   */
  async executeWithResult<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this.execute(fn);
      return {
        success: true,
        result,
        attempts: 1, // Will be updated if retries occurred
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        attempts: this.options.maxRetries + 1,
        totalTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if an error is retryable
   */
  isRetryable(error: Error): boolean {
    if (error instanceof CCOError) {
      return error.retryable;
    }

    // Default heuristics for non-CCOError errors
    const message = error.message.toLowerCase();

    // Network errors are typically retryable
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up')
    ) {
      return true;
    }

    // Rate limit errors are retryable
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429')
    ) {
      return true;
    }

    // Server errors (5xx) are typically retryable
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    ) {
      return true;
    }

    return false;
  }

  private shouldRetry(error: Error, attempt: number): boolean {
    // Check custom retry condition first
    if (this.options.shouldRetry) {
      return this.options.shouldRetry(error, attempt);
    }

    // Respect retryable flag if enabled
    if (this.options.respectRetryable) {
      return this.isRetryable(error);
    }

    return true;
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
    let delay = this.options.initialDelayMs * Math.pow(this.options.backoffMultiplier, attempt - 1);

    // Apply max delay cap
    delay = Math.min(delay, this.options.maxDelayMs);

    // Add jitter (±25% randomization)
    if (this.options.jitter) {
      const jitterRange = delay * 0.25;
      delay = delay - jitterRange + Math.random() * jitterRange * 2;
    }

    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a retry strategy with custom options
 */
export function createRetryStrategy(options: Partial<RetryOptions> = {}): RetryStrategy {
  return new RetryStrategy(options);
}

/**
 * Execute a function with default retry strategy
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const strategy = new RetryStrategy(options);
  return strategy.execute(fn);
}

/**
 * Decorator for adding retry to class methods
 */
export function withRetry(options: Partial<RetryOptions> = {}) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const strategy = new RetryStrategy(options);

    descriptor.value = async function (...args: unknown[]) {
      return strategy.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
