import { Logger } from './Logger.js';
import {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
  CircuitBreakerEvent,
} from '../types/circuit-breaker.js';
import { CircuitBreakerOpenError, CircuitBreakerConfigError } from '../types/errors.js';

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: parseInt(process.env.CCO_CIRCUIT_FAILURE_THRESHOLD ?? '5', 10),
  resetTimeout: parseInt(process.env.CCO_CIRCUIT_RESET_TIMEOUT ?? '60000', 10),
  halfOpenMaxAttempts: 1,
  successThreshold: 1,
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private rejectedRequests = 0;
  private lastStateChange?: Date;
  private nextAttemptAt?: Date;
  private halfOpenAttempts = 0;
  private config: CircuitBreakerConfig;
  private logger: Logger;
  private onStateChange?: (event: CircuitBreakerEvent) => void;

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {},
    onStateChange?: (event: CircuitBreakerEvent) => void
  ) {
    const merged = { ...DEFAULT_CONFIG, ...config };

    if (
      merged.failureThreshold < 1 ||
      merged.halfOpenMaxAttempts < 1 ||
      merged.successThreshold < 1 ||
      merged.resetTimeout < 0 ||
      merged.successThreshold > merged.halfOpenMaxAttempts
    ) {
      throw new CircuitBreakerConfigError(name, merged as unknown as Record<string, unknown>);
    }

    this.config = merged;
    this.logger = new Logger(`CircuitBreaker:${name}`);
    this.onStateChange = onStateChange;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      this.rejectedRequests++;
      this.logger.warn('Request rejected - circuit open', {
        state: this.state,
        nextAttemptAt: this.nextAttemptAt?.toISOString(),
      });
      throw new CircuitBreakerOpenError(this.name);
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;
    }

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
        this.halfOpenAttempts = 0;
        return true;
      }
      return false;
    }

    return false;
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptAt) return false;
    return Date.now() >= this.nextAttemptAt.getTime();
  }

  recordSuccess(): void {
    this.totalRequests++;
    this.successfulRequests++;
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.successCount = 0;
      }
    }
  }

  recordFailure(): void {
    this.totalRequests++;
    this.failedRequests++;
    this.failureCount++;
    this.successCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private onSuccess(): void {
    this.recordSuccess();
  }

  private onFailure(): void {
    this.recordFailure();
  }

  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;

    if (previousState === newState) return;

    this.state = newState;
    this.lastStateChange = new Date();

    if (newState === CircuitState.OPEN) {
      this.nextAttemptAt = new Date(Date.now() + this.config.resetTimeout);
      this.logger.warn('Circuit breaker opened', {
        name: this.name,
        failureCount: this.failureCount,
        nextAttemptAt: this.nextAttemptAt.toISOString(),
      });
    } else if (newState === CircuitState.HALF_OPEN) {
      this.logger.info('Circuit breaker half-open - testing', {
        name: this.name,
      });
    } else if (newState === CircuitState.CLOSED) {
      this.nextAttemptAt = undefined;
      this.failureCount = 0;
      this.logger.info('Circuit breaker closed - recovered', {
        name: this.name,
      });
    }

    const event: CircuitBreakerEvent = {
      state: newState,
      previousState,
      timestamp: this.lastStateChange,
      metrics: this.getMetrics(),
    };

    if (this.onStateChange) {
      this.onStateChange(event);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      rejectedRequests: this.rejectedRequests,
      consecutiveFailures: this.failureCount,
      consecutiveSuccesses: this.successCount,
      lastStateChange: this.lastStateChange,
      nextAttemptAt: this.nextAttemptAt,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.rejectedRequests = 0;
    this.lastStateChange = undefined;
    this.nextAttemptAt = undefined;
    this.halfOpenAttempts = 0;

    this.logger.info('Circuit breaker reset', { name: this.name });
  }

  getCooldownRemaining(): number {
    if (!this.nextAttemptAt || this.state !== CircuitState.OPEN) {
      return 0;
    }
    return Math.max(0, this.nextAttemptAt.getTime() - Date.now());
  }
}
