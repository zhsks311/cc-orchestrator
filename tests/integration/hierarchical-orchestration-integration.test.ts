import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HierarchicalOrchestrator } from '../../src/core/orchestration/HierarchicalOrchestrator.js';
import { ParallelExecutor } from '../../src/core/orchestration/ParallelExecutor.js';
import { DAGBuilder } from '../../src/core/orchestration/DAGBuilder.js';
import { AgentStatus, AgentRole, Priority } from '../../src/types/agent.js';
import { IContextStore } from '../../src/core/context/ContextStore.js';
import { ModelRouter } from '../../src/core/models/ModelRouter.js';
import { IAgentManager } from '../../src/core/agents/AgentManager.js';
import {
  DAGValidationError,
  TaskDecompositionError,
  TaskExecutionError,
} from '../../src/types/hierarchical-orchestration.js';

const createModelRouterMock = (decompositionContent: string, summaryContent: string) => {
  const executeWithFallback = vi.fn().mockImplementation((params: { task: string }) => {
    if (params.task.includes('Return your analysis as a JSON object')) {
      return Promise.resolve({
        content: decompositionContent,
        tokensUsed: { input: 10, output: 20 },
        model: 'gpt-5.2',
        finishReason: 'stop',
      });
    }

    return Promise.resolve({
      content: summaryContent,
      tokensUsed: { input: 10, output: 20 },
      model: 'claude-sonnet-4.5',
      finishReason: 'stop',
    });
  });

  return { executeWithFallback } as unknown as ModelRouter;
};

const createAgentManagerMock = () => {
  let counter = 0;
  const agentTaskMap = new Map<string, string>();

  const createAgent = vi.fn(async (params) => {
    counter += 1;
    const taskId =
      typeof params.context?.taskId === 'string' ? params.context.taskId : `unknown-${counter}`;
    const agentId = `agent-${taskId}-${counter}`;
    agentTaskMap.set(agentId, taskId);
    return {
      id: agentId,
      role: params.role,
      task: params.task,
      status: AgentStatus.QUEUED,
      context: params.context ?? {},
      priority: params.priority ?? Priority.MEDIUM,
      sessionId: params.sessionId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  const waitForCompletion = vi.fn(async (agentId: string) => {
    const taskId = agentTaskMap.get(agentId) ?? agentId;
    return {
      agentId,
      status: AgentStatus.COMPLETED,
      result: `result-${taskId}`,
      executionTimeMs: 10,
    };
  });

  return { createAgent, waitForCompletion } as unknown as IAgentManager;
};

class MockContextStore implements IContextStore {
  private store = new Map<string, unknown>();
  public set = vi.fn(async (params) => {
    this.store.set(`${params.scope}:${params.sessionId}:${params.key}`, params.value);
  });
  public get = vi.fn(async (params) => {
    const value = this.store.get(`${params.scope}:${params.sessionId}:${params.key}`);
    if (value === undefined) {
      throw new Error('Context not found');
    }
    return {
      key: params.key,
      value,
      scope: params.scope,
      sessionId: params.sessionId,
      createdAt: new Date(),
      accessCount: 1,
      lastAccessedAt: new Date(),
    };
  });
  public delete = vi.fn(async (params) => {
    this.store.delete(`${params.scope}:${params.sessionId}:${params.key}`);
  });
  public listBySession = vi.fn(async (_sessionId: string) => []);
  public cleanupExpired = vi.fn(async () => 0);
}

describe('HierarchicalOrchestrator Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run end-to-end flow for a simple request', async () => {
    const decomposition = JSON.stringify({
      tasks: [
        {
          id: 't1',
          description: 'Implement feature',
          type: 'implement',
          dependencies: [],
          estimatedComplexity: 'medium',
        },
        {
          id: 't2',
          description: 'Review feature',
          type: 'review',
          dependencies: ['t1'],
          estimatedComplexity: 'low',
        },
      ],
    });
    const summary = JSON.stringify({ summary: 'Flow complete', nextSteps: ['Run tests'] });
    const modelRouter = createModelRouterMock(decomposition, summary);
    const agentManager = createAgentManagerMock();
    const contextStore = new MockContextStore();

    const orchestrator = new HierarchicalOrchestrator(modelRouter, agentManager, contextStore);
    const result = await orchestrator.orchestrate('Implement feature and review');

    expect(result.summary).toBe('Flow complete');
    expect(result.taskResults).toHaveLength(2);
    expect(result.statistics.totalTasks).toBe(2);
    expect(contextStore.set).toHaveBeenCalled();
  });

  it('should handle complex multi-step workflow', async () => {
    const decomposition = JSON.stringify({
      tasks: [
        {
          id: 't1',
          description: 'Research requirements',
          type: 'research',
          dependencies: [],
          estimatedComplexity: 'low',
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
          description: 'Implement backend',
          type: 'implement',
          dependencies: ['t2'],
          estimatedComplexity: 'high',
        },
        {
          id: 't4',
          description: 'Write documentation',
          type: 'document',
          dependencies: ['t3'],
          estimatedComplexity: 'medium',
        },
      ],
    });
    const summary = JSON.stringify({ summary: 'Complex flow complete' });
    const modelRouter = createModelRouterMock(decomposition, summary);
    const agentManager = createAgentManagerMock();
    const contextStore = new MockContextStore();

    const orchestrator = new HierarchicalOrchestrator(modelRouter, agentManager, contextStore);
    const result = await orchestrator.orchestrate('Run a complex flow');

    expect(result.statistics.totalTasks).toBe(4);
    expect(result.taskResults[0].agent).toBeDefined();
  });

  it('should throw TaskDecompositionError on invalid decomposition', async () => {
    const modelRouter = createModelRouterMock('not-json', JSON.stringify({ summary: 'unused' }));
    const agentManager = createAgentManagerMock();
    const contextStore = new MockContextStore();

    const orchestrator = new HierarchicalOrchestrator(modelRouter, agentManager, contextStore);

    await expect(orchestrator.orchestrate('Bad request')).rejects.toBeInstanceOf(
      TaskDecompositionError
    );
  });

  it('should throw TaskDecompositionError when decomposition detects a cycle', async () => {
    const decomposition = JSON.stringify({
      tasks: [
        {
          id: 't1',
          description: 'Task 1',
          type: 'implement',
          dependencies: ['t2'],
          estimatedComplexity: 'low',
        },
        {
          id: 't2',
          description: 'Task 2',
          type: 'implement',
          dependencies: ['t1'],
          estimatedComplexity: 'low',
        },
      ],
    });

    const modelRouter = createModelRouterMock(decomposition, JSON.stringify({ summary: 'unused' }));
    const agentManager = createAgentManagerMock();
    const contextStore = new MockContextStore();

    const orchestrator = new HierarchicalOrchestrator(modelRouter, agentManager, contextStore);

    await expect(orchestrator.orchestrate('Cycle test')).rejects.toBeInstanceOf(
      TaskDecompositionError
    );
  });

  it('should throw DAGValidationError when DAG builder reports invalid graph', async () => {
    const decomposition = JSON.stringify({
      tasks: [
        {
          id: 't1',
          description: 'Task 1',
          type: 'implement',
          dependencies: [],
          estimatedComplexity: 'low',
        },
      ],
    });
    const modelRouter = createModelRouterMock(decomposition, JSON.stringify({ summary: 'unused' }));
    const agentManager = createAgentManagerMock();
    const contextStore = new MockContextStore();

    vi.spyOn(DAGBuilder.prototype, 'buildDAG').mockReturnValue({
      nodes: new Map(),
      levels: [],
      totalLevels: 0,
      isValid: false,
      validationError: 'Invalid graph',
    });

    const orchestrator = new HierarchicalOrchestrator(modelRouter, agentManager, contextStore);

    await expect(orchestrator.orchestrate('Invalid DAG')).rejects.toBeInstanceOf(
      DAGValidationError
    );
  });

  it('should wrap unexpected execution errors as TaskExecutionError', async () => {
    const decomposition = JSON.stringify({
      tasks: [
        {
          id: 't1',
          description: 'Task 1',
          type: 'implement',
          dependencies: [],
          estimatedComplexity: 'low',
        },
      ],
    });
    const modelRouter = createModelRouterMock(decomposition, JSON.stringify({ summary: 'unused' }));
    const agentManager = createAgentManagerMock();
    const contextStore = new MockContextStore();

    vi.spyOn(ParallelExecutor.prototype, 'execute').mockRejectedValueOnce(
      new Error('execution failure')
    );

    const orchestrator = new HierarchicalOrchestrator(modelRouter, agentManager, contextStore);

    await expect(orchestrator.orchestrate('Execution error')).rejects.toBeInstanceOf(
      TaskExecutionError
    );
  });
});
