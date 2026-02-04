import { Logger } from '../../infrastructure/Logger.js';
import { ModelRouter } from '../models/ModelRouter.js';
import { AgentRole } from '../../types/agent.js';
import {
  DecomposedTask,
  DecompositionResult,
  TaskDecompositionError,
  TaskType,
} from '../../types/hierarchical-orchestration.js';
import { v4 as uuidv4 } from 'uuid';

const DECOMPOSITION_PROMPT = `You are a task decomposition expert. Your job is to break down complex user requests into atomic, actionable tasks that can be executed by specialized AI agents.

Analyze the user request and:
1. Identify discrete work units that need to be completed
2. Determine dependencies between tasks (which tasks must finish before others can start)
3. Classify each task type: research, implement, review, design, document, test, or analyze
4. Estimate complexity: low, medium, or high

IMPORTANT RULES:
- Create ONLY tasks that are truly necessary to fulfill the request
- Each task should be atomic and focused on a single responsibility
- Be specific in task descriptions (mention exact technologies, frameworks, or components)
- Identify true dependencies only (don't create artificial sequential ordering)
- For simple requests, it's okay to have just 1-3 tasks
- Don't over-decompose - tasks should be meaningful units of work

Return your analysis as a JSON object with this exact structure:
{
  "tasks": [
    {
      "id": "t1",
      "description": "Specific task description",
      "type": "research|implement|review|design|document|test|analyze",
      "dependencies": ["t0"],
      "estimatedComplexity": "low|medium|high",
      "priority": 1
    }
  ],
  "reasoning": "Brief explanation of your decomposition strategy"
}

User Request: {{REQUEST}}

Respond ONLY with valid JSON. No other text.`;

export interface ITaskDecomposer {
  decompose(request: string): Promise<DecompositionResult>;
}

export class TaskDecomposer implements ITaskDecomposer {
  private logger: Logger;

  constructor(private modelRouter: ModelRouter) {
    this.logger = new Logger('TaskDecomposer');
  }

  async decompose(request: string): Promise<DecompositionResult> {
    this.logger.info('Decomposing task', { requestLength: request.length });

    try {
      const prompt = DECOMPOSITION_PROMPT.replace('{{REQUEST}}', request);

      const response = await this.modelRouter.executeWithFallback({
        role: AgentRole.ARCH,
        task: prompt,
        temperature: 0.3,
      });

      const parsed = this.parseResponse(response.content);

      const validatedTasks = this.validateTasks(parsed.tasks);

      this.logger.info('Task decomposition complete', {
        taskCount: validatedTasks.length,
        reasoning: parsed.reasoning,
      });

      return {
        tasks: validatedTasks,
        originalRequest: request,
        reasoning: parsed.reasoning,
        success: true,
      };
    } catch (error) {
      this.logger.error('Task decomposition failed', { error });

      return {
        tasks: [],
        originalRequest: request,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parseResponse(content: string): { tasks: DecomposedTask[]; reasoning?: string } {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new TaskDecompositionError('Failed to extract JSON from LLM response');
    }

    const json = JSON.parse(jsonMatch[0]);

    if (!json.tasks || !Array.isArray(json.tasks)) {
      throw new TaskDecompositionError('Invalid response structure: missing tasks array');
    }

    const tasks: DecomposedTask[] = json.tasks.map((task: DecomposedTask, index: number) => ({
      id: task.id || `t${index + 1}`,
      description: task.description,
      type: this.normalizeTaskType(task.type),
      dependencies: task.dependencies || [],
      estimatedComplexity: task.estimatedComplexity || 'medium',
      priority: task.priority || 1,
      context: task.context,
    }));

    return {
      tasks,
      reasoning: json.reasoning,
    };
  }

  private normalizeTaskType(type: unknown): TaskType {
    if (typeof type !== 'string' || type.trim().length === 0) {
      this.logger.warn('Missing task type, defaulting to IMPLEMENT', { type });
      return TaskType.IMPLEMENT;
    }

    const normalized = type.toLowerCase().trim();
    const validTypes = Object.values(TaskType);

    if (validTypes.includes(normalized as TaskType)) {
      return normalized as TaskType;
    }

    this.logger.warn('Invalid task type, defaulting to IMPLEMENT', { type });
    return TaskType.IMPLEMENT;
  }

  private validateTasks(tasks: DecomposedTask[]): DecomposedTask[] {
    if (tasks.length === 0) {
      throw new TaskDecompositionError('No tasks generated from request');
    }

    const taskIds = new Set<string>();
    for (const task of tasks) {
      if (taskIds.has(task.id)) {
        task.id = `${task.id}-${uuidv4().slice(0, 8)}`;
      }
      taskIds.add(task.id);
    }

    for (const task of tasks) {
      const invalidDeps = task.dependencies.filter((depId) => !taskIds.has(depId));
      if (invalidDeps.length > 0) {
        this.logger.warn('Removing invalid dependencies', {
          taskId: task.id,
          invalidDeps,
        });
        task.dependencies = task.dependencies.filter((depId) => taskIds.has(depId));
      }
    }

    this.detectCycles(tasks);

    return tasks;
  }

  private detectCycles(tasks: DecomposedTask[]): void {
    const adjList = new Map<string, string[]>();
    for (const task of tasks) {
      adjList.set(task.id, task.dependencies);
    }

    const visitState = new Map<string, 'visiting' | 'visited'>();
    const stack: string[] = [];

    const visit = (taskId: string): boolean => {
      const state = visitState.get(taskId);
      if (state === 'visiting') {
        stack.push(taskId);
        return true;
      }
      if (state === 'visited') {
        return false;
      }

      visitState.set(taskId, 'visiting');

      const deps = adjList.get(taskId) || [];
      for (const depId of deps) {
        if (visit(depId)) {
          stack.push(taskId);
          return true;
        }
      }

      visitState.set(taskId, 'visited');
      return false;
    };

    for (const taskId of adjList.keys()) {
      if (visitState.has(taskId)) {
        continue;
      }
      if (visit(taskId)) {
        const cyclePath = stack.reverse().join(' -> ');
        throw new TaskDecompositionError(`Circular dependency detected: ${cyclePath}`);
      }
    }
  }
}
