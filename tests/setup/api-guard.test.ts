/**
 * Tests for API Cost Guard
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { wouldBeBlocked, resetAPIGuard } from './api-guard.js';

describe('API Cost Guard', () => {
  beforeEach(() => {
    resetAPIGuard();
  });

  afterEach(() => {
    resetAPIGuard();
  });

  describe('wouldBeBlocked', () => {
    it('should block OpenAI API calls', () => {
      const url = 'https://api.openai.com/v1/chat/completions';
      expect(wouldBeBlocked(url)).toBe(true);
    });

    it('should block Anthropic API calls', () => {
      const url = 'https://api.anthropic.com/v1/messages';
      expect(wouldBeBlocked(url)).toBe(true);
    });

    it('should block Google Generative AI calls', () => {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
      expect(wouldBeBlocked(url)).toBe(true);
    });

    it('should not block non-API URLs', () => {
      const urls = ['https://example.com', 'https://github.com', 'https://localhost:3000'];

      urls.forEach((url) => {
        expect(wouldBeBlocked(url)).toBe(false);
      });
    });

    it('should not block mock/test URLs', () => {
      const url = 'http://localhost:8080/mock-api';
      expect(wouldBeBlocked(url)).toBe(false);
    });
  });

  describe('fetch interception', () => {
    it('should allow non-production API calls', async () => {
      const mockUrl = 'https://example.com/api';

      // This should not throw or warn
      await expect(async () => {
        try {
          await fetch(mockUrl);
        } catch (error) {
          // Network errors are OK, we just don't want blocking errors
          if (error instanceof Error && error.message.includes('BLOCKED')) {
            throw error;
          }
        }
      }).not.toThrow();
    });

    // Note: We can't easily test the actual blocking behavior in this test file
    // because the setupAPIGuard() is already called, and we're in test mode.
    // The blocking behavior is tested in integration tests where we control
    // the environment more carefully.
  });
});
