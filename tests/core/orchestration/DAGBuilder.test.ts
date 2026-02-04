import { describe, it, expect } from 'vitest';
import { DAGBuilder } from '../../../src/core/orchestration/DAGBuilder.js';
import { AgentRole } from '../../../src/types/agent.js';
import {
  TaskAssignment,
  TaskType,
  TaskStatus,
} from '../../../src/types/hierarchical-orchestration.js';

const createAssignment = (id: string, dependencies: string[] = []): TaskAssignment => ({
  task: {
    id,
    description: `Task ${id}`,
    type: TaskType.IMPLEMENT,
    dependencies,
    estimatedComplexity: 'medium',
  },
  agent: AgentRole.ARCH,
  confidence: 0.8,
  reasoning: 'Test assignment',
});

describe('DAGBuilder', () => {
  it('should build a linear dependency chain', () => {
    const builder = new DAGBuilder();
    const assignments = [
      createAssignment('t1'),
      createAssignment('t2', ['t1']),
      createAssignment('t3', ['t2']),
    ];

    const dag = builder.buildDAG(assignments);

    expect(dag.isValid).toBe(true);
    expect(dag.levels).toEqual([['t1'], ['t2'], ['t3']]);
    expect(dag.nodes.get('t2')?.level).toBe(1);
  });

  it('should group parallel tasks in the same level', () => {
    const builder = new DAGBuilder();
    const assignments = [createAssignment('t1'), createAssignment('t2')];

    const dag = builder.buildDAG(assignments);

    expect(dag.isValid).toBe(true);
    expect(dag.levels[0]).toEqual(['t1', 't2']);
  });

  it('should build a complex DAG with multiple levels', () => {
    const builder = new DAGBuilder();
    const assignments = [
      createAssignment('t1'),
      createAssignment('t2', ['t1']),
      createAssignment('t3', ['t1']),
      createAssignment('t4', ['t2', 't3']),
    ];

    const dag = builder.buildDAG(assignments);

    expect(dag.isValid).toBe(true);
    expect(dag.levels).toEqual([['t1'], ['t2', 't3'], ['t4']]);
    expect(dag.nodes.get('t4')?.dependencies).toEqual(['t2', 't3']);
  });

  it('should mark DAG invalid on cycle detection', () => {
    const builder = new DAGBuilder();
    const assignments = [createAssignment('t1', ['t2']), createAssignment('t2', ['t1'])];

    const dag = builder.buildDAG(assignments);

    expect(dag.isValid).toBe(false);
    expect(dag.validationError).toMatch(/Circular dependency/);
  });

  it('should remove invalid dependency references', () => {
    const builder = new DAGBuilder();
    const assignments = [createAssignment('t1', ['missing'])];

    const dag = builder.buildDAG(assignments);

    expect(dag.isValid).toBe(true);
    expect(dag.nodes.get('t1')?.dependencies).toEqual([]);
  });

  it('should handle empty task list', () => {
    const builder = new DAGBuilder();

    const dag = builder.buildDAG([]);

    expect(dag.isValid).toBe(true);
    expect(dag.levels).toEqual([]);
    expect(dag.nodes.size).toBe(0);
  });

  it('should initialize node status as pending', () => {
    const builder = new DAGBuilder();
    const assignments = [createAssignment('t1')];

    const dag = builder.buildDAG(assignments);

    expect(dag.nodes.get('t1')?.status).toBe(TaskStatus.PENDING);
  });
});
