/**
 * Tests for Contract Mock Factory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createContractMock } from './contract-mock-factory.js';
import { OpenAIContract } from '../contracts/provider-contracts.js';
import { createDefaultOpenAIResponse } from './openai-mock.js';

describe('ContractMock', () => {
  let mock: ReturnType<typeof createContractMock>;

  beforeEach(() => {
    mock = createContractMock(OpenAIContract);
  });

  describe('respondWith', () => {
    it('should accept valid response', () => {
      const response = createDefaultOpenAIResponse();

      expect(() => mock.respondWith(response)).not.toThrow();
    });

    it('should reject invalid response', () => {
      const invalidResponse = {
        id: 'test',
        object: 'invalid', // Should be 'chat.completion'
      } as any;

      expect(() => mock.respondWith(invalidResponse)).toThrow(/violates.*contract/);
    });

    it('should return the mock for chaining', () => {
      const response = createDefaultOpenAIResponse();
      const result = mock.respondWith(response);

      expect(result).toBe(mock);
    });
  });

  describe('respondWithSequence', () => {
    it('should accept multiple valid responses', () => {
      const responses = [
        createDefaultOpenAIResponse({ model: 'gpt-4o' }),
        createDefaultOpenAIResponse({ model: 'gpt-4o-mini' }),
      ];

      expect(() => mock.respondWithSequence(...responses)).not.toThrow();
    });

    it('should reject sequence with invalid response', () => {
      const responses = [
        createDefaultOpenAIResponse(),
        { invalid: 'response' } as any,
      ];

      expect(() => mock.respondWithSequence(...responses)).toThrow(/Response 2 violates/);
    });
  });

  describe('getMock', () => {
    it('should validate request matches contract', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      const validRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      };

      await expect(mockFn(validRequest)).resolves.toBeDefined();
    });

    it('should reject invalid request', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      const invalidRequest = {
        model: 'gpt-4o',
        messages: 'invalid', // Should be array
      };

      await expect(mockFn(invalidRequest)).rejects.toThrow(/violates.*contract/);
    });

    it('should return configured response', async () => {
      const response = createDefaultOpenAIResponse({ model: 'test-model' });
      mock.respondWith(response);
      const mockFn = mock.getMock();

      const request = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      const result = await mockFn(request);

      expect(result.model).toBe('test-model');
    });

    it('should return responses from queue in order', async () => {
      const responses = [
        createDefaultOpenAIResponse({ model: 'model-1' }),
        createDefaultOpenAIResponse({ model: 'model-2' }),
        createDefaultOpenAIResponse({ model: 'model-3' }),
      ];

      mock.respondWithSequence(...responses);
      const mockFn = mock.getMock();

      const request = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      const result1 = await mockFn(request);
      const result2 = await mockFn(request);
      const result3 = await mockFn(request);

      expect(result1.model).toBe('model-1');
      expect(result2.model).toBe('model-2');
      expect(result3.model).toBe('model-3');
    });

    it('should throw error when no response configured', async () => {
      const mockFn = mock.getMock();

      const request = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(mockFn(request)).rejects.toThrow(/No response configured/);
    });
  });

  describe('throwError', () => {
    it('should throw configured error', async () => {
      const error = new Error('Test error');
      mock.throwError(error);
      const mockFn = mock.getMock();

      const request = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(mockFn(request)).rejects.toThrow('Test error');
    });

    it('should validate error against error schema', () => {
      const validError = {
        error: {
          message: 'Test error',
          type: 'invalid_request_error',
          param: null,
          code: null,
        },
      };

      expect(() => mock.throwError(validError)).not.toThrow();
    });

    it('should reject invalid error', () => {
      const invalidError = {
        error: {
          message: 123, // Should be string
        },
      } as any;

      expect(() => mock.throwError(invalidError)).toThrow(/violates.*error contract/);
    });
  });

  describe('throwErrorSequence', () => {
    it('should accept sequence of valid errors', () => {
      const errors = [
        new Error('Error 1'),
        {
          error: {
            message: 'Error 2',
            type: 'rate_limit_error',
            param: null,
            code: null,
          },
        },
        new Error('Error 3'),
      ];

      expect(() => mock.throwErrorSequence(...errors)).not.toThrow();
    });

    it('should reject sequence with invalid error object', () => {
      const errors = [
        new Error('Valid error'),
        {
          error: {
            message: 123, // Should be string
          },
        } as any,
      ];

      expect(() => mock.throwErrorSequence(...errors)).toThrow(/Error 2 violates.*error contract/);
    });

    it('should throw errors in sequence', async () => {
      const errors = [
        new Error('First error'),
        new Error('Second error'),
      ];

      mock.throwErrorSequence(...errors);
      const mockFn = mock.getMock();

      const request = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(mockFn(request)).rejects.toThrow('First error');
      await expect(mockFn(request)).rejects.toThrow('Second error');
    });
  });

  describe('call history', () => {
    it('should record call history', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      const request = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await mockFn(request);
      await mockFn(request);

      const history = mock.getCallHistory();

      expect(history).toHaveLength(2);
      expect(history[0].request).toEqual(request);
    });

    it('should track call count', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      const request = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await mockFn(request);
      await mockFn(request);
      await mockFn(request);

      expect(mock.getCallCount()).toBe(3);
    });

    it('should retrieve specific call', async () => {
      mock.respondWithSequence(
        createDefaultOpenAIResponse({ model: 'model-1' }),
        createDefaultOpenAIResponse({ model: 'model-2' })
      );
      const mockFn = mock.getMock();

      const request = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await mockFn(request);
      await mockFn(request);

      const firstCall = mock.getCall(0);
      const secondCall = mock.getCall(1);

      expect(firstCall?.response.model).toBe('model-1');
      expect(secondCall?.response.model).toBe('model-2');
    });
  });

  describe('assertions', () => {
    it('assertCallCount should pass when count matches', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      const request = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await mockFn(request);
      await mockFn(request);

      expect(() => mock.assertCallCount(2)).not.toThrow();
    });

    it('assertCallCount should fail when count does not match', () => {
      expect(() => mock.assertCallCount(5)).toThrow(/Expected 5 calls.*but got 0/);
    });

    it('assertCalled should pass when mock was called', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      await mockFn({
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      });

      expect(() => mock.assertCalled()).not.toThrow();
    });

    it('assertCalled should fail when mock was not called', () => {
      expect(() => mock.assertCalled()).toThrow(/Expected.*to be called/);
    });

    it('assertNotCalled should pass when mock was not called', () => {
      expect(() => mock.assertNotCalled()).not.toThrow();
    });

    it('assertNotCalled should fail when mock was called', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      await mockFn({
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      });

      expect(() => mock.assertNotCalled()).toThrow(/not to be called/);
    });

    it('assertCalledWith should pass when request matches', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      await mockFn({
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Test prompt' }],
        temperature: 0.7,
      });

      expect(() =>
        mock.assertCalledWith({
          model: 'gpt-4o',
          temperature: 0.7,
        })
      ).not.toThrow();
    });

    it('assertCalledWith should fail when request does not match', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      await mockFn({
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      });

      expect(() =>
        mock.assertCalledWith({
          model: 'different-model',
        })
      ).toThrow(/Expected.*to be called with/);
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      mock.respondWith(createDefaultOpenAIResponse());
      const mockFn = mock.getMock();

      await mockFn({
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      });

      mock.reset();

      expect(mock.getCallCount()).toBe(0);
      expect(mock.getCallHistory()).toHaveLength(0);
    });
  });
});
