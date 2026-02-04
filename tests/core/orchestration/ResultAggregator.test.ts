import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResultAggregator } from '../../../src/core/orchestration/ResultAggregator.js';
import { ModelRouter } from '../../../src/core/models/ModelRouter.js';
import { AgentRole } from '../../../src/types/agent.js';
import {
  ExecutionResult,
  OrchestrationContext,
  TaskStatus,
} from '../../../src/types/hierarchical-orchestration.js';

const createModelRouterMock = (content: string, shouldThrow: boolean = false) => {
  const executeWithFallback = shouldThrow
    ? vi.fn().mockRejectedValue(new Error('LLM error'))
    : vi.fn().mockResolvedValue({
        content,
        tokensUsed: { input: 10, output: 20 },
        model: 'claude-sonnet-4.5',
        finishReason: 'stop',
      });

  return { executeWithFallback } as unknown as ModelRouter;
};

const createContext = (): OrchestrationContext => ({
  sessionId: 'session-1',
  request: 'Test request',
  startedAt: new Date(),
  sharedContext: new Map(),
  config: { maxParallelTasks: 5, taskTimeout: 1000, maxRetries: 0, failFast: false },
});

const createResult = (overrides: Partial<ExecutionResult>): ExecutionResult => ({
  taskId: overrides.taskId ?? 't1',
  description: overrides.description ?? 'Task',
  agent: overrides.agent ?? AgentRole.ARCH,
  status: overrides.status ?? TaskStatus.SUCCESS,
  result: overrides.result,
  error: overrides.error,
  duration: overrides.duration ?? 10,
  retries: overrides.retries ?? 0,
  startedAt: overrides.startedAt ?? new Date('2026-01-01T00:00:00Z'),
  completedAt: overrides.completedAt ?? new Date('2026-01-01T00:00:01Z'),
  artifacts: overrides.artifacts,
});

describe('ResultAggregator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('aggregate', () => {
    it('should aggregate successful results', async () => {
      const summaryResponse = JSON.stringify({
        summary: 'All tasks completed successfully.',
        nextSteps: ['Review results'],
      });
      const modelRouter = createModelRouterMock(summaryResponse);
      const aggregator = new ResultAggregator(modelRouter);

      const results = [
        createResult({ taskId: 't1', description: 'Task 1', result: 'done' }),
        createResult({ taskId: 't2', description: 'Task 2', result: 'done' }),
      ];

      const aggregated = await aggregator.aggregate(results, createContext());

      expect(aggregated.summary).toBe('All tasks completed successfully.');
      expect(aggregated.taskResults).toHaveLength(2);
      expect(aggregated.failedTasks).toBeUndefined();
      expect(aggregated.nextSteps).toEqual(['Review results']);
    });

    it('should aggregate partial failures with failedTasks', async () => {
      const summaryResponse = JSON.stringify({
        summary: 'Some tasks failed.',
      });
      const modelRouter = createModelRouterMock(summaryResponse);
      const aggregator = new ResultAggregator(modelRouter);

      const results = [
        createResult({ taskId: 't1', description: 'Security review', status: TaskStatus.FAILURE }),
        createResult({ taskId: 't2', description: 'Implementation', status: TaskStatus.SUCCESS }),
      ];

      const aggregated = await aggregator.aggregate(results, createContext());

      expect(aggregated.failedTasks).toHaveLength(1);
      expect(aggregated.failedTasks?.[0].impact).toBe('critical');
    });

    it('should compute statistics correctly', async () => {
      const summaryResponse = JSON.stringify({ summary: 'Summary' });
      const modelRouter = createModelRouterMock(summaryResponse);
      const aggregator = new ResultAggregator(modelRouter);

      const results = [
        createResult({
          taskId: 't1',
          status: TaskStatus.SUCCESS,
          startedAt: new Date('2026-01-01T00:00:00Z'),
          completedAt: new Date('2026-01-01T00:00:02Z'),
          duration: 2000,
        }),
        createResult({
          taskId: 't2',
          status: TaskStatus.FAILURE,
          startedAt: new Date('2026-01-01T00:00:01Z'),
          completedAt: new Date('2026-01-01T00:00:03Z'),
          duration: 2000,
        }),
      ];

      const aggregated = await aggregator.aggregate(results, createContext());

      expect(aggregated.statistics.totalTasks).toBe(2);
      expect(aggregated.statistics.successfulTasks).toBe(1);
      expect(aggregated.statistics.failedTasks).toBe(1);
      expect(aggregated.statistics.totalDuration).toBe(3000);
    });

    it('should provide fallback summary when LLM fails', async () => {
      const modelRouter = createModelRouterMock('ignored', true);
      const aggregator = new ResultAggregator(modelRouter);

      const results = [
        createResult({ taskId: 't1', status: TaskStatus.SUCCESS }),
        createResult({ taskId: 't2', status: TaskStatus.SKIPPED }),
      ];

      const aggregated = await aggregator.aggregate(results, createContext());

      expect(aggregated.summary).toMatch(/Completed 1 of 2 tasks/);
    });

    it('should classify minor failures when description lacks critical keywords', async () => {
      const summaryResponse = JSON.stringify({ summary: 'Summary' });
      const modelRouter = createModelRouterMock(summaryResponse);
      const aggregator = new ResultAggregator(modelRouter);

      const results = [
        createResult({ taskId: 't1', description: 'Update UI copy', status: TaskStatus.FAILURE }),
      ];

      const aggregated = await aggregator.aggregate(results, createContext());

      expect(aggregated.failedTasks?.[0].impact).toBe('minor');
    });
  });
});
