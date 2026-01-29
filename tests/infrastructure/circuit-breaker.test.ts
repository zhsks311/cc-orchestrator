import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from '../../src/infrastructure/CircuitBreaker.js';
import { CircuitState } from '../../src/types/circuit-breaker.js';
import { CircuitBreakerOpenError } from '../../src/types/errors.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenMaxAttempts: 1,
      successThreshold: 1,
    });
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

    it.skip('should transition to HALF_OPEN after reset timeout', async () => {
      let stateBeforeSuccess: CircuitState = CircuitState.OPEN;

      await vi.waitFor(
        async () => {
          stateBeforeSuccess = circuitBreaker.getState();
          if (stateBeforeSuccess !== CircuitState.HALF_OPEN) {
            throw new Error('Not half-open yet');
          }
        },
        { timeout: 2000, interval: 100 }
      );

      expect(stateBeforeSuccess).toBe(CircuitState.HALF_OPEN);

      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    }, 3000);

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
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error('failure');
          })
        ).rejects.toThrow('failure');
      }

      await vi.waitFor(
        async () => {
          await circuitBreaker.execute(async () => 'success');
        },
        { timeout: 2000, interval: 100 }
      );
    }, 3000);

    it('should transition to CLOSED on success', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition back to OPEN on failure', async () => {
      circuitBreaker = new CircuitBreaker('test-service-2', {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenMaxAttempts: 1,
        successThreshold: 1,
      });

      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error('failure');
          })
        ).rejects.toThrow('failure');
      }

      await vi.waitFor(
        async () => {
          await expect(
            circuitBreaker.execute(async () => {
              throw new Error('still failing');
            })
          ).rejects.toThrow('still failing');
          expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
        },
        { timeout: 2000, interval: 100 }
      );
    }, 3000);

    it.skip('should limit attempts in half-open state', async () => {
      circuitBreaker = new CircuitBreaker('test-service-3', {
        failureThreshold: 3,
        resetTimeout: 500,
        halfOpenMaxAttempts: 2,
        successThreshold: 2,
      });

      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error('failure');
          })
        ).rejects.toThrow('failure');
      }

      await vi.waitFor(
        async () => {
          if (circuitBreaker.getState() !== CircuitState.HALF_OPEN) {
            throw new Error('Not half-open yet');
          }
        },
        { timeout: 1000, interval: 100 }
      );

      await circuitBreaker.execute(async () => 'success');
      await circuitBreaker.execute(async () => 'success');

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    }, 3000);
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
