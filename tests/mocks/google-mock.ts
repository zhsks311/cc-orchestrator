/**
 * Google Generative AI Provider Mock
 *
 * Contract-validated mock for Google Generative AI API
 */

import { createContractMock } from './contract-mock-factory.js';
import { GoogleContract, type GoogleResponse } from '../contracts/provider-contracts.js';

/**
 * Create a default Google response
 */
export function createDefaultGoogleResponse(overrides?: Partial<GoogleResponse>): GoogleResponse {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              text: 'This is a mocked Google Generative AI response.',
            },
          ],
          role: 'model',
        },
        finishReason: 'STOP',
        index: 0,
        safetyRatings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            probability: 'NEGLIGIBLE',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            probability: 'NEGLIGIBLE',
          },
        ],
      },
    ],
    usageMetadata: {
      promptTokenCount: 30,
      candidatesTokenCount: 60,
      totalTokenCount: 90,
    },
    ...overrides,
  };
}

/**
 * Create a Google response with function call
 */
export function createGoogleResponseWithFunctions(
  functionCalls: Array<{ name: string; args: Record<string, any> }>
): GoogleResponse {
  return createDefaultGoogleResponse({
    candidates: [
      {
        content: {
          parts: functionCalls.map((call) => ({
            functionCall: {
              name: call.name,
              args: call.args,
            },
          })),
          role: 'model',
        },
        finishReason: 'STOP',
        index: 0,
      },
    ],
  });
}

/**
 * Create a Google mock with default successful response
 */
export function createGoogleMock() {
  const mock = createContractMock(GoogleContract);

  // Set default response
  mock.respondWith(createDefaultGoogleResponse());

  return mock;
}

/**
 * Create a Google mock for specific model
 */
export function createGoogleMockForModel(model: string, content?: string) {
  const mock = createContractMock(GoogleContract);

  mock.respondWith(
    createDefaultGoogleResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: content || `Response from ${model}`,
              },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
    })
  );

  return mock;
}

/**
 * Create a Google mock that returns an error
 */
export function createGoogleMockWithError(
  errorMessage: string,
  errorCode: number = 400,
  status: string = 'INVALID_ARGUMENT'
) {
  const mock = createContractMock(GoogleContract);

  mock.throwError({
    error: {
      code: errorCode,
      message: errorMessage,
      status: status,
    },
  });

  return mock;
}

/**
 * Create a Google mock that simulates rate limiting
 */
export function createGoogleMockWithRateLimit() {
  return createGoogleMockWithError(
    'Resource has been exhausted (e.g. check quota).',
    429,
    'RESOURCE_EXHAUSTED'
  );
}

/**
 * Create a Google mock that simulates safety block
 */
export function createGoogleMockWithSafetyBlock(category: string = 'HARM_CATEGORY_HATE_SPEECH') {
  return createGoogleMock().respondWith(
    createDefaultGoogleResponse({
      candidates: [
        {
          content: {
            parts: [],
            role: 'model',
          },
          finishReason: 'SAFETY',
          index: 0,
          safetyRatings: [
            {
              category: category,
              probability: 'HIGH',
            },
          ],
        },
      ],
    })
  );
}

/**
 * Create a Google mock that simulates max tokens
 */
export function createGoogleMockWithMaxTokens(
  partialText: string = 'This response was truncated because'
) {
  return createGoogleMock().respondWith(
    createDefaultGoogleResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                text: partialText,
              },
            ],
            role: 'model',
          },
          finishReason: 'MAX_TOKENS',
          index: 0,
        },
      ],
    })
  );
}

/**
 * Create a Google mock that simulates timeout
 */
export function createGoogleMockWithTimeout() {
  const mock = createContractMock(GoogleContract);
  mock.throwError(new Error('Request timeout'));
  return mock;
}

/**
 * Create a Google mock that simulates service unavailable
 */
export function createGoogleMockWithServiceUnavailable() {
  return createGoogleMockWithError('The service is currently unavailable.', 503, 'UNAVAILABLE');
}
