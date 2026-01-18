/**
 * Tests for API Cost Tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { estimateAPICost, getCostBreakdown, formatCost, CostAccumulator } from './cost-tracker.js';

describe('API Cost Tracker', () => {
  describe('estimateAPICost', () => {
    it('should calculate cost for GPT-4o', () => {
      const cost = estimateAPICost('gpt-4o', 1000, 500);
      // (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10
      // = 0.0025 + 0.005 = 0.0075
      expect(cost).toBeCloseTo(0.0075, 6);
    });

    it('should calculate cost for Claude Opus 4', () => {
      const cost = estimateAPICost('claude-opus-4', 2000, 1000);
      // (2000 / 1_000_000) * 15 + (1000 / 1_000_000) * 75
      // = 0.03 + 0.075 = 0.105
      expect(cost).toBeCloseTo(0.105, 6);
    });

    it('should calculate cost for Gemini Flash', () => {
      const cost = estimateAPICost('gemini-2.5-flash', 5000, 2000);
      // (5000 / 1_000_000) * 0.075 + (2000 / 1_000_000) * 0.3
      // = 0.000375 + 0.0006 = 0.000975
      expect(cost).toBeCloseTo(0.000975, 8);
    });

    it('should return 0 for unknown model', () => {
      const cost = estimateAPICost('unknown-model', 1000, 500);
      expect(cost).toBe(0);
    });

    it('should handle zero tokens', () => {
      const cost = estimateAPICost('gpt-4o', 0, 0);
      expect(cost).toBe(0);
    });

    it('should handle large token counts', () => {
      const cost = estimateAPICost('claude-sonnet-4', 1_000_000, 500_000);
      // (1_000_000 / 1_000_000) * 3 + (500_000 / 1_000_000) * 15
      // = 3 + 7.5 = 10.5
      expect(cost).toBeCloseTo(10.5, 4);
    });
  });

  describe('getCostBreakdown', () => {
    it('should provide detailed cost breakdown', () => {
      const breakdown = getCostBreakdown('gpt-4o', 1000, 500);

      expect(breakdown.model).toBe('gpt-4o');
      expect(breakdown.inputTokens).toBe(1000);
      expect(breakdown.outputTokens).toBe(500);
      expect(breakdown.inputCost).toBeCloseTo(0.0025, 6);
      expect(breakdown.outputCost).toBeCloseTo(0.005, 6);
      expect(breakdown.totalCost).toBeCloseTo(0.0075, 6);
    });

    it('should handle unknown model gracefully', () => {
      const breakdown = getCostBreakdown('unknown', 1000, 500);

      expect(breakdown.totalCost).toBe(0);
      expect(breakdown.inputCost).toBe(0);
      expect(breakdown.outputCost).toBe(0);
    });
  });

  describe('formatCost', () => {
    it('should format cost with 4 decimal places', () => {
      expect(formatCost(0.0075)).toBe('$0.0075');
      expect(formatCost(1.23456)).toBe('$1.2346');
      expect(formatCost(0)).toBe('$0.0000');
    });

    it('should handle large costs', () => {
      expect(formatCost(123.456)).toBe('$123.4560');
    });

    it('should handle very small costs', () => {
      expect(formatCost(0.000001)).toBe('$0.0000');
    });
  });

  describe('CostAccumulator', () => {
    let accumulator: CostAccumulator;

    beforeEach(() => {
      accumulator = new CostAccumulator();
    });

    it('should start with zero cost', () => {
      expect(accumulator.getTotalCost()).toBe(0);
    });

    it('should accumulate costs from multiple calls', () => {
      accumulator.add({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.0075,
      });

      accumulator.add({
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        inputTokens: 2000,
        outputTokens: 1000,
        estimatedCost: 0.021,
      });

      expect(accumulator.getTotalCost()).toBeCloseTo(0.0285, 6);
    });

    it('should track cost by provider', () => {
      accumulator.add({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.01,
      });

      accumulator.add({
        provider: 'openai',
        model: 'gpt-4o-mini',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.005,
      });

      accumulator.add({
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        inputTokens: 2000,
        outputTokens: 1000,
        estimatedCost: 0.02,
      });

      const byProvider = accumulator.getCostByProvider();

      expect(byProvider.openai).toBeCloseTo(0.015, 6);
      expect(byProvider.anthropic).toBeCloseTo(0.02, 6);
    });

    it('should track cost by model', () => {
      accumulator.add({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.01,
      });

      accumulator.add({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.01,
      });

      accumulator.add({
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        inputTokens: 2000,
        outputTokens: 1000,
        estimatedCost: 0.02,
      });

      const byModel = accumulator.getCostByModel();

      expect(byModel['gpt-4o']).toBeCloseTo(0.02, 6);
      expect(byModel['claude-sonnet-4']).toBeCloseTo(0.02, 6);
    });

    it('should generate a report', () => {
      accumulator.add({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.0075,
      });

      const report = accumulator.getReport();

      expect(report).toContain('API Cost Report');
      expect(report).toContain('$0.0075');
      expect(report).toContain('openai');
      expect(report).toContain('gpt-4o');
      expect(report).toContain('Total API Calls: 1');
    });

    it('should reset correctly', () => {
      accumulator.add({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.0075,
      });

      accumulator.reset();

      expect(accumulator.getTotalCost()).toBe(0);
      expect(accumulator.getCostByProvider()).toEqual({});
      expect(accumulator.getCostByModel()).toEqual({});
    });

    it('should handle multiple resets', () => {
      accumulator.add({
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.0075,
      });

      accumulator.reset();
      accumulator.reset();

      expect(accumulator.getTotalCost()).toBe(0);
    });
  });
});
