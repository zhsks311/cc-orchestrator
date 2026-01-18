/**
 * API Cost Guard - Prevents accidental real API calls during tests
 *
 * This setup file intercepts fetch calls and blocks production API endpoints
 * to prevent cost leaks during test execution.
 */

import { beforeAll, afterEach, vi } from 'vitest';

const originalFetch = global.fetch;
const apiCallLog: Array<{ url: string; timestamp: number }> = [];

// Production API endpoints to block
const PRODUCTION_APIS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
];

export function setupAPIGuard() {
  beforeAll(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Check if this is a production API call
      const isProductionAPI = PRODUCTION_APIS.some((api) => url.includes(api));

      if (isProductionAPI) {
        const error = new Error(
          `🚨 BLOCKED: Real API call detected!\n` +
            `URL: ${url}\n` +
            `This would cost money. Use mocks instead.\n` +
            `Hint: Check if your test properly mocks the provider.`
        );

        // In CI: fail hard
        if (process.env.CI === 'true') {
          throw error;
        }

        // Locally: warn and log
        console.warn(error.message);
        apiCallLog.push({ url, timestamp: Date.now() });
      }

      return originalFetch(input, init);
    }) as typeof fetch;
  });

  afterEach(() => {
    if (apiCallLog.length > 0) {
      console.log(`\n⚠️  API calls detected in test suite: ${apiCallLog.length}`);
      apiCallLog.forEach(({ url, timestamp }) => {
        console.log(`  - ${new Date(timestamp).toISOString()}: ${url}`);
      });
      apiCallLog.length = 0;
    }
  });
}

/**
 * Reset the API guard (useful for testing the guard itself)
 */
export function resetAPIGuard() {
  apiCallLog.length = 0;
  global.fetch = originalFetch;
}

/**
 * Get the list of blocked API calls
 */
export function getBlockedAPICalls(): ReadonlyArray<{ url: string; timestamp: number }> {
  return [...apiCallLog];
}

/**
 * Check if a URL would be blocked
 */
export function wouldBeBlocked(url: string): boolean {
  return PRODUCTION_APIS.some((api) => url.includes(api));
}

// Auto-setup when imported as setupFile
setupAPIGuard();
