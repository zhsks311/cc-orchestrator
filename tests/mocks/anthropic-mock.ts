/**
 * Anthropic Provider Mock
 *
 * Contract-validated mock for Anthropic API
 */

import { createContractMock } from './contract-mock-factory.js';
import { AnthropicContract, type AnthropicResponse } from '../contracts/provider-contracts.js';

/**
 * Create a default Anthropic response
 */
export function createDefaultAnthropicResponse(
  overrides?: Partial<AnthropicResponse>
): AnthropicResponse {
  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'This is a mocked Anthropic response.',
      },
    ],
    model: 'claude-sonnet-4',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 40,
      output_tokens: 80,
    },
    ...overrides,
  };
}

/**
 * Create an Anthropic response with tool use
 */
export function createAnthropicResponseWithTools(
  toolCalls: Array<{ name: string; input: Record<string, any> }>
): AnthropicResponse {
  return createDefaultAnthropicResponse({
    content: toolCalls.map((call, index) => ({
      type: 'tool_use' as const,
      id: `toolu_${index}_${Date.now()}`,
      name: call.name,
      input: call.input,
    })),
    stop_reason: 'tool_use',
  });
}

/**
 * Create an Anthropic mock with default successful response
 */
export function createAnthropicMock() {
  const mock = createContractMock(AnthropicContract);

  // Set default response
  mock.respondWith(createDefaultAnthropicResponse());

  return mock;
}

/**
 * Create an Anthropic mock for specific model
 */
export function createAnthropicMockForModel(model: string, content?: string) {
  const mock = createContractMock(AnthropicContract);

  mock.respondWith(
    createDefaultAnthropicResponse({
      model,
      content: [
        {
          type: 'text',
          text: content || `Response from ${model}`,
        },
      ],
    })
  );

  return mock;
}

/**
 * Create an Anthropic mock that returns an error
 */
export function createAnthropicMockWithError(
  errorMessage: string,
  errorType: string = 'invalid_request_error'
) {
  const mock = createContractMock(AnthropicContract);

  mock.throwError({
    type: 'error',
    error: {
      type: errorType,
      message: errorMessage,
    },
  });

  return mock;
}

/**
 * Create an Anthropic mock that simulates rate limiting
 */
export function createAnthropicMockWithRateLimit() {
  return createAnthropicMockWithError(
    'Rate limit exceeded. Please slow down your requests.',
    'rate_limit_error'
  );
}

/**
 * Create an Anthropic mock that simulates overloaded API
 */
export function createAnthropicMockWithOverload() {
  return createAnthropicMockWithError('Overloaded. Please try again shortly.', 'overloaded_error');
}

/**
 * Create an Anthropic mock that simulates timeout
 */
export function createAnthropicMockWithTimeout() {
  const mock = createContractMock(AnthropicContract);
  mock.throwError(new Error('Request timeout'));
  return mock;
}

/**
 * Create an Anthropic mock that hits max_tokens
 */
export function createAnthropicMockWithMaxTokens(
  partialText: string = 'This response was cut off due to'
) {
  return createAnthropicMock().respondWith(
    createDefaultAnthropicResponse({
      content: [
        {
          type: 'text',
          text: partialText,
        },
      ],
      stop_reason: 'max_tokens',
    })
  );
}
