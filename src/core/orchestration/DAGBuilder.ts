import { Logger } from '../../infrastructure/Logger.js';
import {
  DAGNode,
  ExecutionDAG,
  TaskAssignment,
  TaskStatus,
} from '../../types/hierarchical-orchestration.js';

export interface IDAGBuilder {
  buildDAG(assignments: TaskAssignment[]): ExecutionDAG;
}

export class DAGBuilder implements IDAGBuilder {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('DAGBuilder');
  }

  buildDAG(assignments: TaskAssignment[]): ExecutionDAG {
    const nodes = new Map<string, DAGNode>();
    const taskOrder = new Map<string, number>();

    assignments.forEach((assignment, index) => {
      const taskId = assignment.task.id;
      taskOrder.set(taskId, index);
      const dependencies = Array.from(new Set(assignment.task.dependencies));

      nodes.set(taskId, {
        taskId,
        task: assignment.task,
        agent: assignment.agent,
        dependencies,
        dependents: [],
        level: 0,
        status: TaskStatus.PENDING,
      });
    });

    this.populateDependents(nodes);

    const cycleCheck = this.detectCycles(nodes);
    if (!cycleCheck.isValid) {
      return {
        nodes,
        levels: [],
        totalLevels: 0,
        isValid: false,
        validationError: cycleCheck.error,
      };
    }

    const levels = this.computeLevels(nodes, taskOrder);

    return {
      nodes,
      levels,
      totalLevels: levels.length,
      isValid: true,
    };
  }

  private populateDependents(nodes: Map<string, DAGNode>): void {
    for (const node of nodes.values()) {
      const validDeps: string[] = [];
      for (const depId of node.dependencies) {
        const depNode = nodes.get(depId);
        if (!depNode) {
          this.logger.warn('Dependency not found in DAG assignments', {
            taskId: node.taskId,
            missingDependency: depId,
          });
          continue;
        }
        depNode.dependents.push(node.taskId);
        validDeps.push(depId);
      }
      node.dependencies = validDeps;
    }
  }

  private detectCycles(nodes: Map<string, DAGNode>): { isValid: boolean; error?: string } {
    const visitState = new Map<string, 'visiting' | 'visited'>();
    const stack: string[] = [];

    const visit = (taskId: string): boolean => {
      if (visitState.get(taskId) === 'visiting') {
        stack.push(taskId);
        return true;
      }
      if (visitState.get(taskId) === 'visited') {
        return false;
      }

      visitState.set(taskId, 'visiting');
      const node = nodes.get(taskId);
      if (!node) {
        return false;
      }

      for (const depId of node.dependencies) {
        if (visit(depId)) {
          stack.push(taskId);
          return true;
        }
      }

      visitState.set(taskId, 'visited');
      return false;
    };

    for (const taskId of nodes.keys()) {
      if (visitState.has(taskId)) {
        continue;
      }
      if (visit(taskId)) {
        const cyclePath = stack.reverse().join(' -> ');
        this.logger.error('Cycle detected in DAG', { cyclePath });
        return {
          isValid: false,
          error: `Circular dependency detected: ${cyclePath}`,
        };
      }
    }

    return { isValid: true };
  }

  private computeLevels(nodes: Map<string, DAGNode>, taskOrder: Map<string, number>): string[][] {
    const inDegree = new Map<string, number>();
    for (const node of nodes.values()) {
      inDegree.set(node.taskId, node.dependencies.length);
    }

    const levels: string[][] = [];
    let currentLevel = Array.from(nodes.keys()).filter(
      (taskId) => (inDegree.get(taskId) ?? 0) === 0
    );

    const orderValue = (taskId: string): number => taskOrder.get(taskId) ?? 0;

    while (currentLevel.length > 0) {
      currentLevel.sort((a, b) => orderValue(a) - orderValue(b));
      levels.push([...currentLevel]);

      const nextLevel: string[] = [];
      for (const taskId of currentLevel) {
        const node = nodes.get(taskId);
        if (!node) {
          continue;
        }
        node.level = levels.length - 1;

        for (const dependentId of node.dependents) {
          const remaining = (inDegree.get(dependentId) ?? 0) - 1;
          inDegree.set(dependentId, remaining);
          if (remaining === 0) {
            nextLevel.push(dependentId);
          }
        }
      }
      currentLevel = nextLevel;
    }

    return levels;
  }
}
