import { Logger } from '../../infrastructure/Logger.js';
import { AgentRole } from '../../types/agent.js';
import {
  DecomposedTask,
  TaskAssignment,
  TaskType,
} from '../../types/hierarchical-orchestration.js';

type ResearchScope = 'external' | 'codebase' | 'unknown';
type ImplementationFocus = 'frontend' | 'architecture' | 'unknown';
type ReviewFocus = 'ui' | 'code' | 'unknown';
type DesignFocus = 'ui' | 'architecture' | 'unknown';
type TestFocus = 'ui' | 'code' | 'unknown';

export interface IAgentSelector {
  selectAgent(task: DecomposedTask): TaskAssignment;
}

export class AgentSelector implements IAgentSelector {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('AgentSelector');
  }

  selectAgent(task: DecomposedTask): TaskAssignment {
    const description = task.description.toLowerCase();
    const contextText = this.flattenContext(task.context);
    const combined = `${description} ${contextText}`.trim();

    const assignment = this.selectByType(task, combined);

    this.logger.debug('Agent selected', {
      taskId: task.id,
      taskType: task.type,
      agent: assignment.agent,
      confidence: assignment.confidence,
    });

    return assignment;
  }

  private selectByType(task: DecomposedTask, combined: string): TaskAssignment {
    switch (task.type) {
      case TaskType.RESEARCH:
        return this.selectResearch(task, combined);
      case TaskType.IMPLEMENT:
        return this.selectImplementation(task, combined);
      case TaskType.REVIEW:
        return this.selectReview(task, combined);
      case TaskType.DESIGN:
        return this.selectDesign(task, combined);
      case TaskType.DOCUMENT:
        return this.buildAssignment(
          task,
          AgentRole.QUILL,
          0.95,
          'Documentation task aligned with Quill specialization.'
        );
      case TaskType.TEST:
        return this.selectTest(task, combined);
      case TaskType.ANALYZE:
        return this.buildAssignment(
          task,
          AgentRole.LENS,
          0.9,
          'Analysis task best handled by Lens for visual or structured inspection.'
        );
      default:
        return this.buildAssignment(
          task,
          AgentRole.ARCH,
          0.6,
          'Defaulting to Arch for general reasoning.'
        );
    }
  }

  private selectResearch(task: DecomposedTask, combined: string): TaskAssignment {
    const scope = this.detectResearchScope(combined);
    if (scope === 'external') {
      return this.buildAssignment(
        task,
        AgentRole.INDEX,
        0.85,
        'External research detected; routing to Index for documentation and best practices.'
      );
    }

    if (scope === 'codebase') {
      return this.buildAssignment(
        task,
        AgentRole.SCOUT,
        0.85,
        'Codebase research detected; routing to Scout for exploration and navigation.'
      );
    }

    return this.buildAssignment(task, AgentRole.INDEX, 0.75, 'Research task; routing to Index.');
  }

  private selectImplementation(task: DecomposedTask, combined: string): TaskAssignment {
    const focus = this.detectImplementationFocus(combined);
    if (focus === 'frontend') {
      return this.buildAssignment(
        task,
        AgentRole.CANVAS,
        0.9,
        'Frontend implementation detected; Canvas is optimized for UI work.'
      );
    }

    if (focus === 'architecture') {
      return this.buildAssignment(
        task,
        AgentRole.ARCH,
        0.85,
        'Architecture/backend implementation detected; Arch is optimized for system-level work.'
      );
    }

    return this.buildAssignment(
      task,
      AgentRole.ARCH,
      0.75,
      'Implementation task defaulting to Arch for general coding.'
    );
  }

  private selectReview(task: DecomposedTask, combined: string): TaskAssignment {
    const focus = this.detectReviewFocus(combined);
    if (focus === 'ui') {
      return this.buildAssignment(
        task,
        AgentRole.CANVAS,
        0.9,
        'UI review detected; Canvas is optimized for visual review.'
      );
    }

    return this.buildAssignment(
      task,
      AgentRole.ARCH,
      focus === 'code' ? 0.85 : 0.75,
      'Code review detected; Arch is optimized for architecture and code quality.'
    );
  }

  private selectDesign(task: DecomposedTask, combined: string): TaskAssignment {
    const focus = this.detectDesignFocus(combined);
    if (focus === 'ui') {
      return this.buildAssignment(
        task,
        AgentRole.CANVAS,
        0.9,
        'UI/UX design detected; Canvas is optimized for visual design.'
      );
    }

    if (focus === 'architecture') {
      return this.buildAssignment(
        task,
        AgentRole.ARCH,
        0.85,
        'Architecture design detected; Arch is optimized for system design.'
      );
    }

    return this.buildAssignment(
      task,
      AgentRole.ARCH,
      0.75,
      'Design task defaulting to Arch for structured system reasoning.'
    );
  }

  private selectTest(task: DecomposedTask, combined: string): TaskAssignment {
    const focus = this.detectTestFocus(combined);
    if (focus === 'ui') {
      return this.buildAssignment(
        task,
        AgentRole.CANVAS,
        0.8,
        'UI testing detected; Canvas is optimized for visual verification.'
      );
    }

    return this.buildAssignment(
      task,
      AgentRole.ARCH,
      focus === 'code' ? 0.8 : 0.7,
      'Test task defaulting to Arch for logic validation.'
    );
  }

  private buildAssignment(
    task: DecomposedTask,
    agent: AgentRole,
    confidence: number,
    reasoning: string
  ): TaskAssignment {
    return {
      task,
      agent,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning,
    };
  }

  private detectResearchScope(combined: string): ResearchScope {
    if (
      this.containsAny(combined, ['web', 'external', 'docs', 'documentation', 'api', 'article'])
    ) {
      return 'external';
    }

    if (
      this.containsAny(combined, [
        'codebase',
        'repository',
        'repo',
        'existing code',
        'find file',
        'locate',
        'search',
        'grep',
      ])
    ) {
      return 'codebase';
    }

    return 'unknown';
  }

  private detectImplementationFocus(combined: string): ImplementationFocus {
    if (
      this.containsAny(combined, [
        'frontend',
        'ui',
        'ux',
        'component',
        'react',
        'vue',
        'svelte',
        'css',
        'layout',
        'style',
      ])
    ) {
      return 'frontend';
    }

    if (
      this.containsAny(combined, [
        'architecture',
        'backend',
        'database',
        'schema',
        'service',
        'api design',
        'domain',
      ])
    ) {
      return 'architecture';
    }

    return 'unknown';
  }

  private detectReviewFocus(combined: string): ReviewFocus {
    if (
      this.containsAny(combined, ['ui', 'ux', 'design review', 'layout', 'visual', 'accessibility'])
    ) {
      return 'ui';
    }

    if (this.containsAny(combined, ['code', 'logic', 'security', 'performance'])) {
      return 'code';
    }

    return 'unknown';
  }

  private detectDesignFocus(combined: string): DesignFocus {
    if (this.containsAny(combined, ['ui', 'ux', 'wireframe', 'layout', 'visual', 'component'])) {
      return 'ui';
    }

    if (
      this.containsAny(combined, [
        'architecture',
        'system design',
        'service',
        'domain',
        'data model',
      ])
    ) {
      return 'architecture';
    }

    return 'unknown';
  }

  private detectTestFocus(combined: string): TestFocus {
    if (this.containsAny(combined, ['ui', 'visual', 'layout', 'accessibility', 'screenshot'])) {
      return 'ui';
    }

    if (this.containsAny(combined, ['unit test', 'integration test', 'e2e', 'logic'])) {
      return 'code';
    }

    return 'unknown';
  }

  private containsAny(haystack: string, needles: string[]): boolean {
    return needles.some((needle) => haystack.includes(needle));
  }

  private flattenContext(context?: Record<string, unknown>): string {
    if (!context) {
      return '';
    }

    try {
      return JSON.stringify(context).toLowerCase();
    } catch (error) {
      this.logger.warn('Failed to stringify task context', { error });
      return '';
    }
  }
}
