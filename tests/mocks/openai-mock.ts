/**
 * OpenAI Provider Mock
 *
 * Contract-validated mock for OpenAI API
 */

import { createContractMock } from './contract-mock-factory.js';
import { OpenAIContract, type OpenAIResponse } from '../contracts/provider-contracts.js';

/**
 * Create a default OpenAI response
 */
export function createDefaultOpenAIResponse(overrides?: Partial<OpenAIResponse>): OpenAIResponse {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'This is a mocked OpenAI response.',
          tool_calls: undefined,
        },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 100,
      total_tokens: 150,
    },
    ...overrides,
  };
}

/**
 * Create an OpenAI response with tool calls
 */
export function createOpenAIResponseWithTools(
  toolCalls: Array<{ name: string; arguments: string }>
): OpenAIResponse {
  return createDefaultOpenAIResponse({
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls.map((call, index) => ({
            id: `call_${index}_${Date.now()}`,
            type: 'function' as const,
            function: {
              name: call.name,
              arguments: call.arguments,
            },
          })),
        },
        finish_reason: 'tool_calls',
        logprobs: null,
      },
    ],
  });
}

/**
 * Create an OpenAI mock with default successful response
 */
export function createOpenAIMock() {
  const mock = createContractMock(OpenAIContract);

  // Set default response
  mock.respondWith(createDefaultOpenAIResponse());

  return mock;
}

/**
 * Create an OpenAI mock for specific model
 */
export function createOpenAIMockForModel(model: string, content?: string) {
  const mock = createContractMock(OpenAIContract);

  mock.respondWith(
    createDefaultOpenAIResponse({
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: content || `Response from ${model}`,
          },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
    })
  );

  return mock;
}

/**
 * Create an OpenAI mock that returns an error
 */
export function createOpenAIMockWithError(errorMessage: string, errorType: string = 'invalid_request_error') {
  const mock = createContractMock(OpenAIContract);

  mock.throwError({
    error: {
      message: errorMessage,
      type: errorType,
      param: null,
      code: null,
    },
  });

  return mock;
}

/**
 * Create an OpenAI mock that simulates rate limiting
 */
export function createOpenAIMockWithRateLimit() {
  return createOpenAIMockWithError(
    'Rate limit exceeded. Please try again later.',
    'rate_limit_exceeded'
  );
}

/**
 * Create an OpenAI mock that simulates timeout
 */
export function createOpenAIMockWithTimeout() {
  const mock = createContractMock(OpenAIContract);
  mock.throwError(new Error('Request timeout'));
  return mock;
}
