/**
 * Contract Mock Factory
 *
 * Creates schema-validated mocks for provider APIs.
 * Ensures requests and responses match the contract, catching drift early.
 */

import { vi, type Mock } from 'vitest';
import type { z } from 'zod';
import type { ContractDefinition } from '../contracts/provider-contracts.js';

export interface MockCallRecord<TRequest, TResponse> {
  request: TRequest;
  response: TResponse;
  timestamp: number;
}

export class ContractMock<TRequest, TResponse, TError = unknown> {
  private mockFn: Mock;
  private callRecords: MockCallRecord<TRequest, TResponse>[] = [];
  private responseQueue: Array<TResponse | Error> = [];
  private defaultResponse?: TResponse;
  private defaultError?: Error | TError;

  constructor(private contract: ContractDefinition<TRequest, TResponse, TError>) {
    this.mockFn = vi.fn();
  }

  /**
   * Configure mock to return a specific response
   */
  respondWith(response: TResponse): this {
    // Validate response matches contract
    try {
      const validated = this.contract.responseSchema.parse(response);
      this.defaultResponse = validated;
      this.mockFn.mockResolvedValue(validated);
    } catch (error) {
      throw new Error(
        `Response violates ${this.contract.name} contract:\n${error}`
      );
    }
    return this;
  }

  /**
   * Queue multiple responses (will be returned in order)
   */
  respondWithSequence(...responses: TResponse[]): this {
    // Validate all responses
    const validated = responses.map((response, index) => {
      try {
        return this.contract.responseSchema.parse(response);
      } catch (error) {
        throw new Error(
          `Response ${index + 1} violates ${this.contract.name} contract:\n${error}`
        );
      }
    });

    this.responseQueue = validated;
    return this;
  }

  /**
   * Configure mock to throw an error
   */
  throwError(error: Error | TError): this {
    // If error matches error schema, validate it
    if (this.contract.errorSchema && !(error instanceof Error)) {
      try {
        this.contract.errorSchema.parse(error);
      } catch (validationError) {
        throw new Error(
          `Error violates ${this.contract.name} error contract:\n${validationError}`
        );
      }
    }

    this.defaultError = error;
    this.mockFn.mockRejectedValue(error);
    return this;
  }

  /**
   * Configure mock to throw a sequence of errors
   */
  throwErrorSequence(...errors: Array<Error | TError>): this {
    this.responseQueue = errors;
    return this;
  }

  /**
   * Get the underlying mock function
   */
  getMock(): Mock {
    return async (request: unknown) => {
      // Validate request matches contract
      let validatedRequest: TRequest;
      try {
        validatedRequest = this.contract.requestSchema.parse(request);
      } catch (error) {
        throw new Error(
          `Request violates ${this.contract.name} contract:\n${error}`
        );
      }

      // Handle response queue
      if (this.responseQueue.length > 0) {
        const next = this.responseQueue.shift()!;

        if (next instanceof Error) {
          throw next;
        }

        // Record successful call
        this.callRecords.push({
          request: validatedRequest,
          response: next,
          timestamp: Date.now(),
        });

        return next;
      }

      // Handle default error
      if (this.defaultError) {
        throw this.defaultError;
      }

      // Handle default response
      if (this.defaultResponse) {
        this.callRecords.push({
          request: validatedRequest,
          response: this.defaultResponse,
          timestamp: Date.now(),
        });

        return this.mockFn(request);
      }

      // No response configured
      throw new Error(
        `No response configured for ${this.contract.name} mock. ` +
        `Use respondWith() or respondWithSequence() first.`
      );
    };
  }

  /**
   * Assert all calls had valid requests
   */
  assertAllCallsValid(): void {
    const calls = this.mockFn.mock.calls;

    calls.forEach((call, index) => {
      const [request] = call;
      try {
        this.contract.requestSchema.parse(request);
      } catch (error) {
        throw new Error(
          `Call ${index + 1} violated ${this.contract.name} contract:\n${error}`
        );
      }
    });
  }

  /**
   * Get call history
   */
  getCallHistory(): ReadonlyArray<MockCallRecord<TRequest, TResponse>> {
    return [...this.callRecords];
  }

  /**
   * Get number of calls
   */
  getCallCount(): number {
    return this.mockFn.mock.calls.length;
  }

  /**
   * Get specific call by index
   */
  getCall(index: number): { request: TRequest; response: TResponse } | undefined {
    return this.callRecords[index];
  }

  /**
   * Get all requests
   */
  getAllRequests(): TRequest[] {
    return this.callRecords.map(record => record.request);
  }

  /**
   * Get all responses
   */
  getAllResponses(): TResponse[] {
    return this.callRecords.map(record => record.response);
  }

  /**
   * Reset the mock
   */
  reset(): void {
    this.mockFn.mockReset();
    this.callRecords = [];
    this.responseQueue = [];
    this.defaultResponse = undefined;
    this.defaultError = undefined;
  }

  /**
   * Assert mock was called N times
   */
  assertCallCount(expected: number): void {
    const actual = this.getCallCount();
    if (actual !== expected) {
      throw new Error(
        `Expected ${expected} calls to ${this.contract.name} mock, but got ${actual}`
      );
    }
  }

  /**
   * Assert mock was called at least once
   */
  assertCalled(): void {
    if (this.getCallCount() === 0) {
      throw new Error(`Expected ${this.contract.name} mock to be called, but it wasn't`);
    }
  }

  /**
   * Assert mock was never called
   */
  assertNotCalled(): void {
    if (this.getCallCount() > 0) {
      throw new Error(
        `Expected ${this.contract.name} mock not to be called, ` +
        `but it was called ${this.getCallCount()} times`
      );
    }
  }

  /**
   * Assert mock was called with specific request
   */
  assertCalledWith(expectedRequest: Partial<TRequest>): void {
    const requests = this.getAllRequests();

    const found = requests.some(request =>
      Object.entries(expectedRequest).every(([key, value]) => {
        const requestValue = (request as any)[key];
        return JSON.stringify(requestValue) === JSON.stringify(value);
      })
    );

    if (!found) {
      throw new Error(
        `Expected ${this.contract.name} mock to be called with:\n` +
        JSON.stringify(expectedRequest, null, 2) + '\n' +
        `But actual requests were:\n` +
        JSON.stringify(requests, null, 2)
      );
    }
  }
}

/**
 * Create a contract-validated mock
 */
export function createContractMock<TRequest, TResponse, TError = unknown>(
  contract: ContractDefinition<TRequest, TResponse, TError>
): ContractMock<TRequest, TResponse, TError> {
  return new ContractMock(contract);
}
