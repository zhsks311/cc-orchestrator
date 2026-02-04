import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskDecomposer } from '../../../src/core/orchestration/TaskDecomposer.js';
import { ModelRouter } from '../../../src/core/models/ModelRouter.js';
import { TaskType } from '../../../src/types/hierarchical-orchestration.js';

const createModelRouterMock = (content: string) => {
  const executeWithFallback = vi.fn().mockResolvedValue({
    content,
    tokensUsed: { input: 10, output: 20 },
    model: 'gpt-5.2',
    finishReason: 'stop',
  });

  return { executeWithFallback } as unknown as ModelRouter;
};

describe('TaskDecomposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('decompose', () => {
    it('should decompose a single-task request without over-decomposing', async () => {
      const response = JSON.stringify({
        tasks: [
          {
            id: 't1',
            description: 'Implement a single feature',
            type: 'implement',
            dependencies: [],
            estimatedComplexity: 'low',
            priority: 1,
          },
        ],
        reasoning: 'Simple request, one task.',
      });

      const modelRouter = createModelRouterMock(response);
      const decomposer = new TaskDecomposer(modelRouter);

      const result = await decomposer.decompose('Implement a single feature');

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].description).toBe('Implement a single feature');
    });

    it('should decompose a complex request into multiple tasks', async () => {
      const response = JSON.stringify({
        tasks: [
          {
            id: 't1',
            description: 'Research API constraints',
            type: 'research',
            dependencies: [],
            estimatedComplexity: 'medium',
          },
          {
            id: 't2',
            description: 'Design architecture',
            type: 'design',
            dependencies: ['t1'],
            estimatedComplexity: 'high',
          },
          {
            id: 't3',
            description: 'Implement endpoints',
            type: 'implement',
            dependencies: ['t2'],
            estimatedComplexity: 'high',
          },
        ],
        reasoning: 'Multiple steps required.',
      });

      const modelRouter = createModelRouterMock(response);
      const decomposer = new TaskDecomposer(modelRouter);

      const result = await decomposer.decompose('Build a new API feature');

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(3);
      expect(result.tasks[1].dependencies).toEqual(['t1']);
    });

    it('should remove invalid dependency references', async () => {
      const response = JSON.stringify({
        tasks: [
          {
            id: 't1',
            description: 'Implement something',
            type: 'implement',
            dependencies: ['missing-task'],
            estimatedComplexity: 'low',
          },
        ],
      });

      const modelRouter = createModelRouterMock(response);
      const decomposer = new TaskDecomposer(modelRouter);

      const result = await decomposer.decompose('Implement something');

      expect(result.success).toBe(true);
      expect(result.tasks[0].dependencies).toEqual([]);
    });

    it('should detect cycles and return failure', async () => {
      const response = JSON.stringify({
        tasks: [
          {
            id: 't1',
            description: 'First task',
            type: 'implement',
            dependencies: ['t2'],
            estimatedComplexity: 'medium',
          },
          {
            id: 't2',
            description: 'Second task',
            type: 'implement',
            dependencies: ['t1'],
            estimatedComplexity: 'medium',
          },
        ],
      });

      const modelRouter = createModelRouterMock(response);
      const decomposer = new TaskDecomposer(modelRouter);

      const result = await decomposer.decompose('Create a cycle');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Circular dependency/);
    });

    it('should handle invalid JSON response', async () => {
      const modelRouter = createModelRouterMock('Not JSON at all');
      const decomposer = new TaskDecomposer(modelRouter);

      const result = await decomposer.decompose('Invalid response');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Failed to extract JSON/);
    });

    it('should handle JSON parsing errors', async () => {
      const modelRouter = createModelRouterMock('{ invalid json }');
      const decomposer = new TaskDecomposer(modelRouter);

      const result = await decomposer.decompose('Parse error');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should normalize invalid task types to implement', async () => {
      const response = JSON.stringify({
        tasks: [
          {
            id: 't1',
            description: 'Unknown task type',
            type: 'mystery',
            dependencies: [],
            estimatedComplexity: 'low',
          },
        ],
      });

      const modelRouter = createModelRouterMock(response);
      const decomposer = new TaskDecomposer(modelRouter);

      const result = await decomposer.decompose('Normalize type');

      expect(result.success).toBe(true);
      expect(result.tasks[0].type).toBe(TaskType.IMPLEMENT);
    });
  });
});
