import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker } from '../../src/infrastructure/CircuitBreaker.js';
import { CircuitState } from '../../src/types/circuit-breaker.js';
import { CircuitBreakerOpenError, CircuitBreakerConfigError } from '../../src/types/errors.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenMaxAttempts: 1,
      successThreshold: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('CLOSED state', () => {
    it('should allow requests when circuit is closed', async () => {
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should track successful requests', async () => {
      await circuitBreaker.execute(async () => 'success');
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
    });

    it('should track failed requests', async () => {
      await expect(
        circuitBreaker.execute(async () => {
          throw new Error('failure');
        })
      ).rejects.toThrow('failure');

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.consecutiveFailures).toBe(1);
    });

    it('should transition to OPEN after threshold failures', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error('failure');
          })
        ).rejects.toThrow('failure');
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.consecutiveFailures).toBe(3);
    });

    it('should reset failure count on success', async () => {
      await expect(
        circuitBreaker.execute(async () => {
          throw new Error('failure');
        })
      ).rejects.toThrow('failure');

      await circuitBreaker.execute(async () => 'success');

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.consecutiveFailures).toBe(0);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error('failure');
          })
        ).rejects.toThrow('failure');
      }
    });

    it('should reject requests immediately when circuit is open', async () => {
      await expect(circuitBreaker.execute(async () => 'success')).rejects.toThrow(
        CircuitBreakerOpenError
      );

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.rejectedRequests).toBe(1);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Advance time past the resetTimeout (1000ms)
      vi.advanceTimersByTime(1001);

      // The next execute triggers HALF_OPEN transition internally via canExecute()
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have nextAttemptAt set', () => {
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.nextAttemptAt).toBeDefined();
      expect(metrics.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return correct cooldown remaining', () => {
      const cooldown = circuitBreaker.getCooldownRemaining();
      expect(cooldown).toBeGreaterThan(0);
      expect(cooldown).toBeLessThanOrEqual(1000);
    });
  });

  describe('HALF_OPEN state', () => {
    it('should transition to CLOSED on success', async () => {
      // Drive to OPEN
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error('failure');
          })
        ).rejects.toThrow('failure');
      }
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Advance past resetTimeout
      vi.advanceTimersByTime(1001);

      // Success in HALF_OPEN → CLOSED
      await circuitBreaker.execute(async () => 'success');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition back to OPEN on failure', async () => {
      // Drive to OPEN
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error('failure');
          })
        ).rejects.toThrow('failure');
      }
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Advance past resetTimeout
      vi.advanceTimersByTime(1001);

      // Failure in HALF_OPEN → back to OPEN
      await expect(
        circuitBreaker.execute(async () => {
          throw new Error('still failing');
        })
      ).rejects.toThrow('still failing');
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should limit attempts in half-open state', async () => {
      const cb = new CircuitBreaker('test-service-3', {
        failureThreshold: 3,
        resetTimeout: 500,
        halfOpenMaxAttempts: 2,
        successThreshold: 2,
      });

      // Drive to OPEN
      for (let i = 0; i < 3; i++) {
        await expect(
          cb.execute(async () => {
            throw new Error('failure');
          })
        ).rejects.toThrow('failure');
      }
      expect(cb.getState()).toBe(CircuitState.OPEN);

      // Advance past resetTimeout
      vi.advanceTimersByTime(501);

      // Two successes needed (successThreshold: 2) within halfOpenMaxAttempts: 2
      await cb.execute(async () => 'success');
      await cb.execute(async () => 'success');

      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('config validation', () => {
    it('should reject failureThreshold < 1', () => {
      expect(() => new CircuitBreaker('bad', { failureThreshold: 0 })).toThrow(
        CircuitBreakerConfigError
      );
    });

    it('should reject halfOpenMaxAttempts < 1', () => {
      expect(() => new CircuitBreaker('bad', { halfOpenMaxAttempts: 0 })).toThrow(
        CircuitBreakerConfigError
      );
    });

    it('should reject successThreshold < 1', () => {
      expect(() => new CircuitBreaker('bad', { successThreshold: 0 })).toThrow(
        CircuitBreakerConfigError
      );
    });

    it('should reject negative resetTimeout', () => {
      expect(() => new CircuitBreaker('bad', { resetTimeout: -1 })).toThrow(
        CircuitBreakerConfigError
      );
    });

    it('should reject successThreshold > halfOpenMaxAttempts', () => {
      expect(
        () =>
          new CircuitBreaker('bad', {
            successThreshold: 3,
            halfOpenMaxAttempts: 2,
          })
      ).toThrow(CircuitBreakerConfigError);
    });

    it('should accept valid config', () => {
      expect(
        () =>
          new CircuitBreaker('good', {
            failureThreshold: 5,
            resetTimeout: 0,
            halfOpenMaxAttempts: 3,
            successThreshold: 2,
          })
      ).not.toThrow();
    });
  });

  describe('metrics', () => {
    it('should track all metrics correctly', async () => {
      await circuitBreaker.execute(async () => 'success');

      await expect(
        circuitBreaker.execute(async () => {
          throw new Error('failure');
        })
      ).rejects.toThrow('failure');

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.rejectedRequests).toBe(0);
      expect(metrics.consecutiveFailures).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset all metrics and state', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error('failure');
          })
        ).rejects.toThrow('failure');
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.consecutiveFailures).toBe(0);
      expect(metrics.nextAttemptAt).toBeUndefined();
    });
  });

  describe('state change callback', () => {
    it('should call callback on state transitions', async () => {
      const callback = vi.fn();
      const cb = new CircuitBreaker(
        'test-callback',
        {
          failureThreshold: 2,
          resetTimeout: 500,
        },
        callback
      );

      await expect(
        cb.execute(async () => {
          throw new Error('failure');
        })
      ).rejects.toThrow('failure');
      expect(callback).not.toHaveBeenCalled();

      await expect(
        cb.execute(async () => {
          throw new Error('failure');
        })
      ).rejects.toThrow('failure');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          state: CircuitState.OPEN,
          previousState: CircuitState.CLOSED,
        })
      );
    });
  });
});
