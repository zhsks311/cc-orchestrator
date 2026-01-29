import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallelExecutor } from '../../../src/core/orchestration/ParallelExecutor.js';
import { IAgentManager } from '../../../src/core/agents/AgentManager.js';
import { AgentRole, AgentStatus, Priority } from '../../../src/types/agent.js';
import { TimeoutError } from '../../../src/types/errors.js';
import {
  ExecutionDAG,
  DAGNode,
  OrchestrationContext,
  TaskStatus,
  ExecutionResult,
  TaskType,
} from '../../../src/types/hierarchical-orchestration.js';

const createNode = (taskId: string, deps: string[] = []): DAGNode => ({
  taskId,
  task: {
    id: taskId,
    description: `Task ${taskId}`,
    type: TaskType.IMPLEMENT,
    dependencies: deps,
    estimatedComplexity: 'medium',
  },
  agent: AgentRole.ARCH,
  dependencies: deps,
  dependents: [],
  level: 0,
  status: TaskStatus.PENDING,
});

const buildDAG = (levels: string[][], nodes: DAGNode[]): ExecutionDAG => {
  const map = new Map<string, DAGNode>();
  nodes.forEach((node) => map.set(node.taskId, node));
  return {
    nodes: map,
    levels,
    totalLevels: levels.length,
    isValid: true,
  };
};

const createContext = (overrides?: Partial<OrchestrationContext>): OrchestrationContext => ({
  sessionId: 'session-1',
  request: 'Test request',
  startedAt: new Date(),
  sharedContext: new Map(),
  config: {
    maxParallelTasks: 5,
    taskTimeout: 1000,
    maxRetries: 0,
    failFast: false,
    minConfidence: 0,
  },
  ...overrides,
});

const createAgentManagerMock = () => {
  let counter = 0;
  const createAgent = vi.fn(async (params) => {
    counter += 1;
    return {
      id: `agent-${counter}`,
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

  const waitForCompletion = vi.fn();

  return { createAgent, waitForCompletion } as unknown as IAgentManager;
};

describe('ParallelExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('execute', () => {
    it('should execute tasks sequentially when dependencies exist', async () => {
      const agentManager = createAgentManagerMock();
      const executor = new ParallelExecutor(agentManager);

      const node1 = createNode('t1');
      const node2 = createNode('t2', ['t1']);
      node1.dependents = ['t2'];
      node2.level = 1;

      const dag = buildDAG([['t1'], ['t2']], [node1, node2]);
      const context = createContext();

      (agentManager.waitForCompletion as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          agentId: 'agent-1',
          status: AgentStatus.COMPLETED,
          result: 'result-1',
          executionTimeMs: 10,
        })
        .mockResolvedValueOnce({
          agentId: 'agent-2',
          status: AgentStatus.COMPLETED,
          result: 'result-2',
          executionTimeMs: 10,
        });

      const results = await executor.execute(dag, context);

      expect(results).toHaveLength(2);
      expect(results[0].taskId).toBe('t1');
      expect(results[1].taskId).toBe('t2');
      expect(agentManager.createAgent).toHaveBeenCalledTimes(2);
    });

    it('should execute tasks in parallel when no dependencies', async () => {
      const agentManager = createAgentManagerMock();
      const executor = new ParallelExecutor(agentManager);

      const node1 = createNode('t1');
      const node2 = createNode('t2');

      const dag = buildDAG([['t1', 't2']], [node1, node2]);
      const context = createContext();

      (agentManager.waitForCompletion as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          agentId: 'agent-1',
          status: AgentStatus.COMPLETED,
          result: 'result-1',
          executionTimeMs: 10,
        })
        .mockResolvedValueOnce({
          agentId: 'agent-2',
          status: AgentStatus.COMPLETED,
          result: 'result-2',
          executionTimeMs: 10,
        });

      const results = await executor.execute(dag, context);

      expect(results).toHaveLength(2);
      expect(agentManager.createAgent).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed parallel and sequential execution', async () => {
      const agentManager = createAgentManagerMock();
      const executor = new ParallelExecutor(agentManager);

      const node1 = createNode('t1');
      const node2 = createNode('t2');
      const node3 = createNode('t3', ['t1', 't2']);
      node1.dependents = ['t3'];
      node2.dependents = ['t3'];
      node3.level = 1;

      const dag = buildDAG([['t1', 't2'], ['t3']], [node1, node2, node3]);
      const context = createContext();

      (agentManager.waitForCompletion as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          agentId: 'agent-1',
          status: AgentStatus.COMPLETED,
          result: 'result-1',
          executionTimeMs: 10,
        })
        .mockResolvedValueOnce({
          agentId: 'agent-2',
          status: AgentStatus.COMPLETED,
          result: 'result-2',
          executionTimeMs: 10,
        })
        .mockResolvedValueOnce({
          agentId: 'agent-3',
          status: AgentStatus.COMPLETED,
          result: 'result-3',
          executionTimeMs: 10,
        });

      const results = await executor.execute(dag, context);

      expect(results).toHaveLength(3);
      const task3Call = (agentManager.createAgent as unknown as ReturnType<typeof vi.fn>).mock
        .calls[2][0];
      const dependencyResults = task3Call.context?.dependencyResults as Record<string, unknown>;
      expect(dependencyResults).toEqual({ t1: 'result-1', t2: 'result-2' });
    });

    it('should skip tasks when dependencies failed', async () => {
      const agentManager = createAgentManagerMock();
      const executor = new ParallelExecutor(agentManager);

      const node1 = createNode('t1');
      const node2 = createNode('t2', ['t1']);
      node1.dependents = ['t2'];
      node2.level = 1;

      const dag = buildDAG([['t1'], ['t2']], [node1, node2]);
      const context = createContext();

      (agentManager.waitForCompletion as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        {
          agentId: 'agent-1',
          status: AgentStatus.FAILED,
          error: { message: 'failed', code: 'ERR', retryable: false },
          executionTimeMs: 10,
        }
      );

      const results = await executor.execute(dag, context);

      const failure = results.find((result) => result.taskId === 't1');
      const skipped = results.find((result) => result.taskId === 't2');
      expect(failure?.status).toBe(TaskStatus.FAILURE);
      expect(skipped?.status).toBe(TaskStatus.SKIPPED);
    });

    it('should respect fail-fast mode and skip remaining tasks', async () => {
      const agentManager = createAgentManagerMock();
      const executor = new ParallelExecutor(agentManager);

      const node1 = createNode('t1');
      const node2 = createNode('t2');
      const node3 = createNode('t3', ['t1', 't2']);
      node1.dependents = ['t3'];
      node2.dependents = ['t3'];

      const dag = buildDAG([['t1', 't2'], ['t3']], [node1, node2, node3]);
      const context = createContext({
        config: {
          maxParallelTasks: 5,
          taskTimeout: 1000,
          maxRetries: 0,
          failFast: true,
          minConfidence: 0,
        },
      });

      (agentManager.waitForCompletion as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          agentId: 'agent-1',
          status: AgentStatus.FAILED,
          error: { message: 'failed', code: 'ERR', retryable: false },
          executionTimeMs: 10,
        })
        .mockResolvedValueOnce({
          agentId: 'agent-2',
          status: AgentStatus.COMPLETED,
          result: 'result-2',
          executionTimeMs: 10,
        });

      const results = await executor.execute(dag, context);
      const skipped = results.find((result) => result.taskId === 't3');

      expect(skipped?.status).toBe(TaskStatus.SKIPPED);
      expect(skipped?.error?.message).toMatch(/fail-fast/);
    });

    it('should retry on retryable failure and succeed', async () => {
      vi.useFakeTimers();
      const agentManager = createAgentManagerMock();
      const executor = new ParallelExecutor(agentManager);

      const node1 = createNode('t1');
      const dag = buildDAG([['t1']], [node1]);
      const context = createContext({
        config: {
          maxParallelTasks: 5,
          taskTimeout: 1000,
          maxRetries: 1,
          failFast: false,
          minConfidence: 0,
        },
      });

      (agentManager.waitForCompletion as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          agentId: 'agent-1',
          status: AgentStatus.FAILED,
          error: { message: 'retryable', code: 'ERR', retryable: true },
          executionTimeMs: 10,
        })
        .mockResolvedValueOnce({
          agentId: 'agent-2',
          status: AgentStatus.COMPLETED,
          result: 'result-1',
          executionTimeMs: 10,
        });

      const executePromise = executor.execute(dag, context);
      await vi.runAllTimersAsync();
      const results = await executePromise;

      expect(results[0].status).toBe(TaskStatus.SUCCESS);
      expect(results[0].retries).toBe(1);
      vi.useRealTimers();
    });

    it('should mark task failed on timeout', async () => {
      const agentManager = createAgentManagerMock();
      const executor = new ParallelExecutor(agentManager);

      const node1 = createNode('t1');
      const dag = buildDAG([['t1']], [node1]);
      const context = createContext({
        config: {
          maxParallelTasks: 5,
          taskTimeout: 100,
          maxRetries: 0,
          failFast: false,
          minConfidence: 0,
        },
      });

      (agentManager.waitForCompletion as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new TimeoutError('wait_agent', 100)
      );

      const results = await executor.execute(dag, context);

      expect(results[0].status).toBe(TaskStatus.FAILURE);
      expect(results[0].error?.message).toMatch(/timed out/);
    });

    it('should collect execution results with artifacts', async () => {
      const agentManager = createAgentManagerMock();
      const executor = new ParallelExecutor(agentManager);

      const node1 = createNode('t1');
      const dag = buildDAG([['t1']], [node1]);
      const context = createContext();

      (agentManager.waitForCompletion as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        {
          agentId: 'agent-1',
          status: AgentStatus.COMPLETED,
          result: { artifacts: ['file.ts'] },
          executionTimeMs: 10,
        }
      );

      const results = await executor.execute(dag, context);
      const result = results[0] as ExecutionResult;

      expect(result.status).toBe(TaskStatus.SUCCESS);
      expect(result.artifacts).toEqual(['file.ts']);
    });
  });
});
