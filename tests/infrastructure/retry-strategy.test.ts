/**
 * RetryStrategy Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RetryStrategy,
  createRetryStrategy,
  retryWithBackoff,
} from '../../src/infrastructure/RetryStrategy.js';
import { CCOError, ModelAPIError } from '../../src/types/errors.js';

describe('RetryStrategy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('execute', () => {
    it('should return result on first successful attempt', async () => {
      const strategy = new RetryStrategy({ maxRetries: 3 });
      const fn = vi.fn().mockResolvedValue('success');

      const resultPromise = strategy.execute(fn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed', async () => {
      const strategy = new RetryStrategy({
        maxRetries: 3,
        initialDelayMs: 100,
        jitter: false,
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ModelAPIError('API error', 'openai'))
        .mockResolvedValue('success after retry');

      const resultPromise = strategy.execute(fn);

      // First attempt fails
      await vi.advanceTimersByTimeAsync(0);
      // Wait for retry delay
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;

      expect(result).toBe('success after retry');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable error', async () => {
      const strategy = new RetryStrategy({ maxRetries: 3 });

      class NonRetryableError extends CCOError {
        constructor() {
          super('Non-retryable', 'NON_RETRYABLE', false, 400);
        }
      }

      const fn = vi.fn().mockRejectedValue(new NonRetryableError());

      await expect(strategy.execute(fn)).rejects.toThrow('Non-retryable');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw last error', async () => {
      const strategy = new RetryStrategy({
        maxRetries: 2,
        initialDelayMs: 100,
        jitter: false,
      });

      const fn = vi.fn().mockRejectedValue(new ModelAPIError('Persistent error', 'openai'));

      const executePromise = strategy.execute(fn);
      // Attach no-op handler to prevent unhandled rejection during timer advancement
      executePromise.catch(() => {});

      await vi.runAllTimersAsync();

      await expect(executePromise).rejects.toThrow('Persistent error');
      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should call onRetry callback on each retry', async () => {
      const onRetry = vi.fn();
      const strategy = new RetryStrategy({
        maxRetries: 2,
        initialDelayMs: 100,
        jitter: false,
        onRetry,
      });

      const error = new ModelAPIError('API error', 'openai');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const executePromise = strategy.execute(fn);

      // Run all timers to completion
      await vi.runAllTimersAsync();

      await executePromise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, error, 1, 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, error, 2, 200);
    });

    it('should respect custom shouldRetry function', async () => {
      const strategy = new RetryStrategy({
        maxRetries: 3,
        shouldRetry: (error, _attempt) => {
          // Only retry if message contains 'temporary'
          return error.message.includes('temporary');
        },
      });

      const fn = vi.fn().mockRejectedValue(new Error('permanent error'));

      await expect(strategy.execute(fn)).rejects.toThrow('permanent error');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRetryable', () => {
    it('should return true for CCOError with retryable=true', () => {
      const strategy = new RetryStrategy();
      const error = new ModelAPIError('API error', 'openai');

      expect(strategy.isRetryable(error)).toBe(true);
    });

    it('should return false for CCOError with retryable=false', () => {
      const strategy = new RetryStrategy();

      class ValidationError extends CCOError {
        constructor() {
          super('Invalid input', 'VALIDATION_ERROR', false, 400);
        }
      }

      expect(strategy.isRetryable(new ValidationError())).toBe(false);
    });

    it('should return true for network errors', () => {
      const strategy = new RetryStrategy();

      expect(strategy.isRetryable(new Error('network error'))).toBe(true);
      expect(strategy.isRetryable(new Error('ECONNRESET'))).toBe(true);
      expect(strategy.isRetryable(new Error('socket hang up'))).toBe(true);
    });

    it('should return true for rate limit errors', () => {
      const strategy = new RetryStrategy();

      expect(strategy.isRetryable(new Error('rate limit exceeded'))).toBe(true);
      expect(strategy.isRetryable(new Error('too many requests'))).toBe(true);
      expect(strategy.isRetryable(new Error('Error 429'))).toBe(true);
    });

    it('should return true for server errors', () => {
      const strategy = new RetryStrategy();

      expect(strategy.isRetryable(new Error('500 Internal Server Error'))).toBe(true);
      expect(strategy.isRetryable(new Error('502 Bad Gateway'))).toBe(true);
      expect(strategy.isRetryable(new Error('503 Service Unavailable'))).toBe(true);
      expect(strategy.isRetryable(new Error('504 Gateway Timeout'))).toBe(true);
    });

    it('should return false for unknown errors', () => {
      const strategy = new RetryStrategy();

      expect(strategy.isRetryable(new Error('Unknown error'))).toBe(false);
      expect(strategy.isRetryable(new Error('Invalid argument'))).toBe(false);
    });
  });

  describe('exponential backoff', () => {
    it('should increase delay exponentially', async () => {
      const onRetry = vi.fn();
      const strategy = new RetryStrategy({
        maxRetries: 4,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        jitter: false, // Disable jitter for predictable delays
        onRetry,
      });

      const error = new ModelAPIError('API error', 'openai');
      const fn = vi.fn().mockRejectedValue(error);

      const executePromise = strategy.execute(fn);
      // Attach no-op handler to prevent unhandled rejection during timer advancement
      executePromise.catch(() => {});

      await vi.runAllTimersAsync();

      await expect(executePromise).rejects.toThrow();

      // Check delays: 100, 200, 400, 800
      expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 200);
      expect(onRetry).toHaveBeenNthCalledWith(3, expect.any(Error), 3, 400);
      expect(onRetry).toHaveBeenNthCalledWith(4, expect.any(Error), 4, 800);
    });

    it('should cap delay at maxDelayMs', async () => {
      const onRetry = vi.fn();
      const strategy = new RetryStrategy({
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 3000,
        backoffMultiplier: 2,
        jitter: false,
        onRetry,
      });

      const fn = vi.fn().mockRejectedValue(new ModelAPIError('API error', 'openai'));

      const executePromise = strategy.execute(fn);
      // Attach no-op handler to prevent unhandled rejection during timer advancement
      executePromise.catch(() => {});

      await vi.runAllTimersAsync();

      await expect(executePromise).rejects.toThrow();

      // Delays should be: 1000, 2000, 3000 (capped), 3000 (capped), 3000 (capped)
      expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, 1000);
      expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 2000);
      expect(onRetry).toHaveBeenNthCalledWith(3, expect.any(Error), 3, 3000);
      expect(onRetry).toHaveBeenNthCalledWith(4, expect.any(Error), 4, 3000);
      expect(onRetry).toHaveBeenNthCalledWith(5, expect.any(Error), 5, 3000);
    });
  });

  describe('executeWithResult', () => {
    it('should return success result', async () => {
      const strategy = new RetryStrategy();
      const fn = vi.fn().mockResolvedValue('data');

      const result = await strategy.executeWithResult(fn);

      expect(result.success).toBe(true);
      expect(result.result).toBe('data');
      expect(result.error).toBeUndefined();
    });

    it('should return failure result without throwing', async () => {
      const strategy = new RetryStrategy({ maxRetries: 0 });
      const error = new Error('test error');
      const fn = vi.fn().mockRejectedValue(error);

      const result = await strategy.executeWithResult(fn);

      expect(result.success).toBe(false);
      expect(result.result).toBeUndefined();
      expect(result.error).toBe(error);
    });
  });

  describe('createRetryStrategy helper', () => {
    it('should create strategy with custom options', () => {
      const strategy = createRetryStrategy({ maxRetries: 5 });

      expect(strategy).toBeInstanceOf(RetryStrategy);
    });
  });

  describe('retryWithBackoff helper', () => {
    it('should execute with default options', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const result = await retryWithBackoff(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should accept custom options', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const result = await retryWithBackoff(fn, { maxRetries: 5 });

      expect(result).toBe('result');
    });
  });

  describe('respectRetryable option', () => {
    it('should retry all errors when respectRetryable is false', async () => {
      const strategy = new RetryStrategy({
        maxRetries: 2,
        initialDelayMs: 100,
        jitter: false,
        respectRetryable: false,
      });

      // Non-retryable error normally
      class NonRetryableError extends CCOError {
        constructor() {
          super('Non-retryable', 'NON_RETRYABLE', false, 400);
        }
      }

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new NonRetryableError())
        .mockResolvedValue('success');

      const executePromise = strategy.execute(fn);

      // Run all timers to completion
      await vi.runAllTimersAsync();

      const result = await executePromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
