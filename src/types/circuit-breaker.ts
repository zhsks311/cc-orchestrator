/**
 * Circuit Breaker Pattern Types
 */

/**
 * Circuit Breaker States
 */
export enum CircuitState {
  /** Normal operation - requests pass through */
  CLOSED = 'closed',
  /** Circuit is open - requests fail fast */
  OPEN = 'open',
  /** Testing if system recovered - limited requests allowed */
  HALF_OPEN = 'half_open',
}

/**
 * Circuit Breaker Configuration
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures to open circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before attempting reset from OPEN to HALF_OPEN (default: 60000) */
  resetTimeout: number;
  /** Number of test requests allowed in HALF_OPEN state (default: 1) */
  halfOpenMaxAttempts: number;
  /** Success threshold to close circuit from HALF_OPEN (default: 1) */
  successThreshold: number;
}

/**
 * Circuit Breaker Metrics
 */
export interface CircuitBreakerMetrics {
  /** Current state */
  state: CircuitState;
  /** Total number of requests */
  totalRequests: number;
  /** Number of successful requests */
  successfulRequests: number;
  /** Number of failed requests */
  failedRequests: number;
  /** Number of rejected requests (circuit open) */
  rejectedRequests: number;
  /** Consecutive failure count */
  consecutiveFailures: number;
  /** Consecutive success count (in HALF_OPEN) */
  consecutiveSuccesses: number;
  /** Last state transition time */
  lastStateChange?: Date;
  /** Time when circuit will attempt reset (OPEN → HALF_OPEN) */
  nextAttemptAt?: Date;
}

/**
 * Circuit Breaker Event
 */
export interface CircuitBreakerEvent {
  state: CircuitState;
  previousState: CircuitState;
  timestamp: Date;
  reason?: string;
  metrics: CircuitBreakerMetrics;
}
