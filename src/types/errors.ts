/**
 * Custom Error Classes
 */

export abstract class CCOError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode,
    };
  }
}

// Client Errors (4xx)
export class ValidationError extends CCOError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', false, 400);
  }
}

export class AgentNotFoundError extends CCOError {
  constructor(agentId: string) {
    super(`Agent ${agentId} not found`, 'AGENT_NOT_FOUND', false, 404);
  }
}

export class ContextNotFoundError extends CCOError {
  constructor(key: string) {
    super(`Context ${key} not found`, 'CONTEXT_NOT_FOUND', false, 404);
  }
}

export class OrchestrationNotFoundError extends CCOError {
  constructor(orchestrationId: string) {
    super(
      `Orchestration ${orchestrationId} not found`,
      'ORCHESTRATION_NOT_FOUND',
      false,
      404
    );
  }
}

export class InvalidRoleError extends CCOError {
  constructor(role: string) {
    super(`Invalid agent role: ${role}`, 'INVALID_ROLE', false, 400);
  }
}

// Server Errors (5xx - retryable)
export class ModelAPIError extends CCOError {
  constructor(
    message: string,
    public provider: string
  ) {
    super(message, 'MODEL_API_ERROR', true, 502);
  }
}

export class TimeoutError extends CCOError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation ${operation} timed out after ${timeoutMs}ms`,
      'TIMEOUT',
      true,
      504
    );
  }
}

export class ResourceExhaustedError extends CCOError {
  constructor(message: string) {
    super(message, 'RESOURCE_EXHAUSTED', true, 503);
  }
}

export class CircuitBreakerOpenError extends CCOError {
  constructor(provider: string) {
    super(
      `Circuit breaker is open for provider: ${provider}`,
      'CIRCUIT_BREAKER_OPEN',
      true,
      503
    );
  }
}

export class RateLimitError extends CCOError {
  constructor(
    operation: string,
    public retryAfter: Date
  ) {
    super(
      `Rate limit exceeded for ${operation}. Retry after ${retryAfter.toISOString()}`,
      'RATE_LIMIT_EXCEEDED',
      true,
      429
    );
  }
}

export class ConfigurationError extends CCOError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR', false, 500);
  }
}
