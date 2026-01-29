import { describe, it, expect, beforeEach } from 'vitest';
import { AgentSelector } from '../../../src/core/orchestration/AgentSelector.js';
import { AgentRole } from '../../../src/types/agent.js';
import { DecomposedTask, TaskType } from '../../../src/types/hierarchical-orchestration.js';

const createTask = (overrides: Partial<DecomposedTask>): DecomposedTask => ({
  id: overrides.id ?? 't1',
  description: overrides.description ?? 'Default task',
  type: overrides.type ?? TaskType.IMPLEMENT,
  dependencies: overrides.dependencies ?? [],
  estimatedComplexity: overrides.estimatedComplexity ?? 'medium',
  context: overrides.context,
  priority: overrides.priority,
});

describe('AgentSelector', () => {
  let selector: AgentSelector;

  beforeEach(() => {
    selector = new AgentSelector();
  });

  describe('selectAgent', () => {
    it('should select Arch for research tasks targeting external docs', () => {
      const task = createTask({
        type: TaskType.RESEARCH,
        description: 'Research external docs for API usage',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.ARCH);
      expect(assignment.confidence).toBe(0.7);
      expect(assignment.reasoning).toMatch(/External research/);
    });

    it('should select Arch for codebase research tasks', () => {
      const task = createTask({
        type: TaskType.RESEARCH,
        description: 'Search the codebase for auth modules',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.ARCH);
      expect(assignment.confidence).toBe(0.7);
      expect(assignment.reasoning).toMatch(/Codebase research/);
    });

    it('should select Canvas for frontend implementation tasks', () => {
      const task = createTask({
        type: TaskType.IMPLEMENT,
        description: 'Implement React UI component with CSS',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.CANVAS);
      expect(assignment.confidence).toBe(0.9);
      expect(assignment.reasoning).toMatch(/Frontend implementation/);
    });

    it('should select Arch for architecture implementation tasks', () => {
      const task = createTask({
        type: TaskType.IMPLEMENT,
        description: 'Implement backend service architecture',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.ARCH);
      expect(assignment.confidence).toBe(0.85);
      expect(assignment.reasoning).toMatch(/Architecture\/backend/);
    });

    it('should fall back to Arch for unknown implementation focus', () => {
      const task = createTask({
        type: TaskType.IMPLEMENT,
        description: 'Implement generic logic',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.ARCH);
      expect(assignment.confidence).toBe(0.75);
      expect(assignment.reasoning).toMatch(/defaulting to Arch/);
    });

    it('should select Canvas for UI review tasks', () => {
      const task = createTask({
        type: TaskType.REVIEW,
        description: 'Review UI layout and accessibility',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.CANVAS);
      expect(assignment.confidence).toBe(0.9);
      expect(assignment.reasoning).toMatch(/UI review/);
    });

    it('should select Arch for code review tasks', () => {
      const task = createTask({
        type: TaskType.REVIEW,
        description: 'Review code for performance',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.ARCH);
      expect(assignment.confidence).toBe(0.85);
      expect(assignment.reasoning).toMatch(/Code review/);
    });

    it('should select Canvas for UI design tasks', () => {
      const task = createTask({
        type: TaskType.DESIGN,
        description: 'Design UI layout for dashboard',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.CANVAS);
      expect(assignment.confidence).toBe(0.9);
      expect(assignment.reasoning).toMatch(/UI\/UX design/);
    });

    it('should select Arch for architecture design tasks', () => {
      const task = createTask({
        type: TaskType.DESIGN,
        description: 'Design system architecture',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.ARCH);
      expect(assignment.confidence).toBe(0.85);
      expect(assignment.reasoning).toMatch(/Architecture design/);
    });

    it('should select Quill for documentation tasks', () => {
      const task = createTask({
        type: TaskType.DOCUMENT,
        description: 'Write API documentation',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.QUILL);
      expect(assignment.confidence).toBe(0.95);
      expect(assignment.reasoning).toMatch(/Documentation task/);
    });

    it('should select Canvas for UI testing tasks', () => {
      const task = createTask({
        type: TaskType.TEST,
        description: 'Test UI layout and visual regressions',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.CANVAS);
      expect(assignment.confidence).toBe(0.8);
      expect(assignment.reasoning).toMatch(/UI testing/);
    });

    it('should select Arch for code testing tasks', () => {
      const task = createTask({
        type: TaskType.TEST,
        description: 'Run unit test and integration test',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.ARCH);
      expect(assignment.confidence).toBe(0.8);
      expect(assignment.reasoning).toMatch(/Test task defaulting/);
    });

    it('should select Lens for analyze tasks', () => {
      const task = createTask({
        type: TaskType.ANALYZE,
        description: 'Analyze PDF report',
      });

      const assignment = selector.selectAgent(task);

      expect(assignment.agent).toBe(AgentRole.LENS);
      expect(assignment.confidence).toBe(0.9);
      expect(assignment.reasoning).toMatch(/Analysis task/);
    });
  });
});
