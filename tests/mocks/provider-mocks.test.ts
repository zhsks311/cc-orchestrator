/**
 * Tests for Provider-Specific Mocks
 */

import { describe, it, expect } from 'vitest';
import {
  createOpenAIMock,
  createOpenAIMockForModel,
  createOpenAIMockWithError,
  createOpenAIMockWithRateLimit,
  createDefaultOpenAIResponse,
  createOpenAIResponseWithTools,
} from './openai-mock.js';
import {
  createAnthropicMock,
  createAnthropicMockForModel,
  createAnthropicMockWithError,
  createAnthropicMockWithRateLimit,
  createDefaultAnthropicResponse,
  createAnthropicResponseWithTools,
} from './anthropic-mock.js';
import {
  createGoogleMock,
  createGoogleMockForModel,
  createGoogleMockWithError,
  createGoogleMockWithRateLimit,
  createDefaultGoogleResponse,
  createGoogleResponseWithFunctions,
} from './google-mock.js';

describe('OpenAI Mock', () => {
  describe('createDefaultOpenAIResponse', () => {
    it('should create valid response', () => {
      const response = createDefaultOpenAIResponse();

      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('object', 'chat.completion');
      expect(response).toHaveProperty('choices');
      expect(response.choices[0].message.content).toBeDefined();
    });

    it('should accept overrides', () => {
      const response = createDefaultOpenAIResponse({
        model: 'custom-model',
      });

      expect(response.model).toBe('custom-model');
    });
  });

  describe('createOpenAIResponseWithTools', () => {
    it('should create response with tool calls', () => {
      const response = createOpenAIResponseWithTools([
        {
          name: 'get_weather',
          arguments: JSON.stringify({ location: 'Tokyo' }),
        },
      ]);

      expect(response.choices[0].message.tool_calls).toHaveLength(1);
      expect(response.choices[0].message.tool_calls![0].function.name).toBe('get_weather');
      expect(response.choices[0].finish_reason).toBe('tool_calls');
    });
  });

  describe('createOpenAIMock', () => {
    it('should create mock with default response', async () => {
      const mock = createOpenAIMock();
      const mockFn = mock.getMock();

      const result = await mockFn({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.choices[0].message.content).toBeDefined();
    });
  });

  describe('createOpenAIMockForModel', () => {
    it('should create mock for specific model', async () => {
      const mock = createOpenAIMockForModel('gpt-5.2', 'Custom response');
      const mockFn = mock.getMock();

      const result = await mockFn({
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.model).toBe('gpt-5.2');
      expect(result.choices[0].message.content).toBe('Custom response');
    });
  });

  describe('createOpenAIMockWithError', () => {
    it('should throw error', async () => {
      const mock = createOpenAIMockWithError('Test error');
      const mockFn = mock.getMock();

      await expect(
        mockFn({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toMatchObject({
        error: {
          message: 'Test error',
        },
      });
    });
  });

  describe('createOpenAIMockWithRateLimit', () => {
    it('should throw rate limit error', async () => {
      const mock = createOpenAIMockWithRateLimit();
      const mockFn = mock.getMock();

      await expect(
        mockFn({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toMatchObject({
        error: {
          type: 'rate_limit_exceeded',
        },
      });
    });
  });
});

describe('Anthropic Mock', () => {
  describe('createDefaultAnthropicResponse', () => {
    it('should create valid response', () => {
      const response = createDefaultAnthropicResponse();

      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('type', 'message');
      expect(response).toHaveProperty('role', 'assistant');
      expect(response.content[0]).toHaveProperty('type', 'text');
    });

    it('should accept overrides', () => {
      const response = createDefaultAnthropicResponse({
        model: 'claude-opus-4',
      });

      expect(response.model).toBe('claude-opus-4');
    });
  });

  describe('createAnthropicResponseWithTools', () => {
    it('should create response with tool use', () => {
      const response = createAnthropicResponseWithTools([
        {
          name: 'calculator',
          input: { operation: 'add', a: 5, b: 3 },
        },
      ]);

      expect(response.content[0]).toHaveProperty('type', 'tool_use');
      expect(response.content[0]).toHaveProperty('name', 'calculator');
      expect(response.stop_reason).toBe('tool_use');
    });
  });

  describe('createAnthropicMock', () => {
    it('should create mock with default response', async () => {
      const mock = createAnthropicMock();
      const mockFn = mock.getMock();

      const result = await mockFn({
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
      });

      expect(result.content[0].type).toBe('text');
    });
  });

  describe('createAnthropicMockForModel', () => {
    it('should create mock for specific model', async () => {
      const mock = createAnthropicMockForModel('claude-opus-4', 'Deep analysis');
      const mockFn = mock.getMock();

      const result = await mockFn({
        model: 'claude-opus-4',
        messages: [{ role: 'user', content: 'Analyze this' }],
        max_tokens: 2048,
      });

      expect(result.model).toBe('claude-opus-4');
      expect((result.content[0] as any).text).toBe('Deep analysis');
    });
  });

  describe('createAnthropicMockWithError', () => {
    it('should throw error', async () => {
      const mock = createAnthropicMockWithError('Authentication failed');
      const mockFn = mock.getMock();

      await expect(
        mockFn({
          model: 'claude-sonnet-4',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 1024,
        })
      ).rejects.toMatchObject({
        type: 'error',
        error: {
          message: 'Authentication failed',
        },
      });
    });
  });

  describe('createAnthropicMockWithRateLimit', () => {
    it('should throw rate limit error', async () => {
      const mock = createAnthropicMockWithRateLimit();
      const mockFn = mock.getMock();

      await expect(
        mockFn({
          model: 'claude-sonnet-4',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 1024,
        })
      ).rejects.toMatchObject({
        error: {
          type: 'rate_limit_error',
        },
      });
    });
  });
});

describe('Google Mock', () => {
  describe('createDefaultGoogleResponse', () => {
    it('should create valid response', () => {
      const response = createDefaultGoogleResponse();

      expect(response).toHaveProperty('candidates');
      expect(response.candidates[0].content.role).toBe('model');
      expect(response.candidates[0].finishReason).toBe('STOP');
    });

    it('should accept overrides', () => {
      const response = createDefaultGoogleResponse({
        candidates: [
          {
            content: {
              parts: [{ text: 'Custom text' }],
              role: 'model',
            },
            finishReason: 'MAX_TOKENS',
          },
        ],
      });

      expect(response.candidates[0].finishReason).toBe('MAX_TOKENS');
    });
  });

  describe('createGoogleResponseWithFunctions', () => {
    it('should create response with function calls', () => {
      const response = createGoogleResponseWithFunctions([
        {
          name: 'search',
          args: { query: 'weather Tokyo' },
        },
      ]);

      expect(response.candidates[0].content.parts[0]).toHaveProperty('functionCall');
      expect(response.candidates[0].content.parts[0].functionCall?.name).toBe('search');
    });
  });

  describe('createGoogleMock', () => {
    it('should create mock with default response', async () => {
      const mock = createGoogleMock();
      const mockFn = mock.getMock();

      const result = await mockFn({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
      });

      expect(result.candidates[0].content.parts[0].text).toBeDefined();
    });
  });

  describe('createGoogleMockForModel', () => {
    it('should create mock for specific model', async () => {
      const mock = createGoogleMockForModel('gemini-2.5-pro', 'Advanced analysis');
      const mockFn = mock.getMock();

      const result = await mockFn({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Analyze' }],
          },
        ],
      });

      expect(result.candidates[0].content.parts[0].text).toBe('Advanced analysis');
    });
  });

  describe('createGoogleMockWithError', () => {
    it('should throw error', async () => {
      const mock = createGoogleMockWithError('API key invalid', 401, 'UNAUTHENTICATED');
      const mockFn = mock.getMock();

      await expect(
        mockFn({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Hello' }],
            },
          ],
        })
      ).rejects.toMatchObject({
        error: {
          code: 401,
          status: 'UNAUTHENTICATED',
        },
      });
    });
  });

  describe('createGoogleMockWithRateLimit', () => {
    it('should throw rate limit error', async () => {
      const mock = createGoogleMockWithRateLimit();
      const mockFn = mock.getMock();

      await expect(
        mockFn({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Hello' }],
            },
          ],
        })
      ).rejects.toMatchObject({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
        },
      });
    });
  });
});

describe('Cross-Provider Consistency', () => {
  it('all mocks should handle basic text completion', async () => {
    const openaiMock = createOpenAIMock();
    const anthropicMock = createAnthropicMock();
    const googleMock = createGoogleMock();

    const openaiResult = await openaiMock.getMock()({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Test' }],
    });

    const anthropicResult = await anthropicMock.getMock()({
      model: 'claude-sonnet-4',
      messages: [{ role: 'user', content: 'Test' }],
      max_tokens: 1024,
    });

    const googleResult = await googleMock.getMock()({
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
    });

    // All should return text content
    expect(openaiResult.choices[0].message.content).toBeDefined();
    expect((anthropicResult.content[0] as any).text).toBeDefined();
    expect(googleResult.candidates[0].content.parts[0].text).toBeDefined();
  });

  it('all mocks should handle errors consistently', async () => {
    const openaiMock = createOpenAIMockWithError('Error');
    const anthropicMock = createAnthropicMockWithError('Error');
    const googleMock = createGoogleMockWithError('Error');

    await expect(
      openaiMock.getMock()({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Test' }],
      })
    ).rejects.toThrow();

    await expect(
      anthropicMock.getMock()({
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 1024,
      })
    ).rejects.toThrow();

    await expect(
      googleMock.getMock()({
        contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      })
    ).rejects.toThrow();
  });
});
