import { Logger } from '../../infrastructure/Logger.js';
import { ModelRouter } from '../models/ModelRouter.js';
import { AgentRole } from '../../types/agent.js';
import {
  AggregatedResult,
  ExecutionResult,
  OrchestrationContext,
  TaskStatus,
} from '../../types/hierarchical-orchestration.js';

const SUMMARY_PROMPT = `You are summarizing the results of a multi-agent orchestration run.

Return a JSON object with this exact structure:
{
  "summary": "Concise summary of what was accomplished and any failures",
  "nextSteps": ["Optional follow-up actions"]
}

Rules:
- Keep the summary under 6 sentences
- Mention critical failures explicitly if any occurred
- Keep nextSteps concise and actionable
- Respond with JSON only`;

export interface IResultAggregator {
  aggregate(results: ExecutionResult[], context: OrchestrationContext): Promise<AggregatedResult>;
}

export class ResultAggregator implements IResultAggregator {
  private logger: Logger;

  constructor(private modelRouter: ModelRouter) {
    this.logger = new Logger('ResultAggregator');
  }

  async aggregate(
    results: ExecutionResult[],
    context: OrchestrationContext
  ): Promise<AggregatedResult> {
    const statistics = this.calculateStatistics(results);
    const taskResults = results.map((result) => ({
      taskId: result.taskId,
      description: result.description,
      agent: result.agent,
      status: result.status,
      keyFindings: this.extractKeyFindings(result.result),
      artifacts: result.artifacts,
    }));

    const failedTasks = this.collectFailedTasks(results) ?? [];
    const summaryResponse = await this.generateSummary(results, context, statistics, failedTasks);

    return {
      summary: summaryResponse.summary,
      taskResults,
      failedTasks: failedTasks.length > 0 ? failedTasks : undefined,
      nextSteps: summaryResponse.nextSteps,
      statistics,
    };
  }

  private async generateSummary(
    results: ExecutionResult[],
    context: OrchestrationContext,
    statistics: AggregatedResult['statistics'],
    failedTasks: AggregatedResult['failedTasks']
  ): Promise<{ summary: string; nextSteps?: string[] }> {
    const summaryContext = {
      request: context.request,
      statistics,
      failedTasks,
      results: results.map((result) => ({
        taskId: result.taskId,
        description: result.description,
        agent: result.agent,
        status: result.status,
        output: this.summarizeValue(result.result),
        error: result.error?.message,
      })),
    };

    try {
      const response = await this.modelRouter.executeWithFallback({
        role: AgentRole.ARCH,
        task: SUMMARY_PROMPT,
        context: summaryContext,
        temperature: 0.2,
        maxTokens: 800,
      });

      const parsed = this.parseSummary(response.content);
      return {
        summary: parsed.summary,
        nextSteps: parsed.nextSteps,
      };
    } catch (error) {
      this.logger.warn('Failed to generate LLM summary, using fallback', { error });
      return {
        summary: this.buildFallbackSummary(results, statistics, failedTasks),
      };
    }
  }

  private parseSummary(content: string): { summary: string; nextSteps?: string[] } {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { summary: content.trim() };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const summary = typeof parsed.summary === 'string' ? parsed.summary : content.trim();
      const nextSteps = Array.isArray(parsed.nextSteps)
        ? parsed.nextSteps.filter((step: unknown) => typeof step === 'string')
        : undefined;
      return { summary, nextSteps };
    } catch {
      return { summary: content.trim() };
    }
  }

  private calculateStatistics(results: ExecutionResult[]): AggregatedResult['statistics'] {
    const totalTasks = results.length;
    const successfulTasks = results.filter((r) => r.status === TaskStatus.SUCCESS).length;
    const failedTasks = results.filter((r) => r.status === TaskStatus.FAILURE).length;
    const skippedTasks = results.filter((r) => r.status === TaskStatus.SKIPPED).length;

    const startedAt = results.reduce<Date | null>((min, result) => {
      if (!min || result.startedAt < min) {
        return result.startedAt;
      }
      return min;
    }, null);

    const completedAt = results.reduce<Date | null>((max, result) => {
      if (!max || result.completedAt > max) {
        return result.completedAt;
      }
      return max;
    }, null);

    const totalDuration =
      startedAt && completedAt ? completedAt.getTime() - startedAt.getTime() : 0;
    const sequentialDuration = results.reduce((sum, result) => sum + result.duration, 0);
    const parallelismAchieved =
      totalDuration > 0 ? Number((sequentialDuration / totalDuration).toFixed(2)) : 1;

    return {
      totalTasks,
      successfulTasks,
      failedTasks,
      skippedTasks,
      totalDuration,
      parallelismAchieved,
    };
  }

  private collectFailedTasks(results: ExecutionResult[]): AggregatedResult['failedTasks'] {
    const failures = results.filter((result) => result.status === TaskStatus.FAILURE);
    if (failures.length === 0) {
      return undefined;
    }

    return failures.map((result) => ({
      taskId: result.taskId,
      description: result.description,
      error: result.error?.message ?? 'Unknown error',
      impact: this.assessImpact(result.description),
    }));
  }

  private assessImpact(description: string): 'critical' | 'minor' {
    const normalized = description.toLowerCase();
    const criticalKeywords = [
      'architecture',
      'security',
      'auth',
      'database',
      'migration',
      'core',
      'api',
    ];
    return criticalKeywords.some((keyword) => normalized.includes(keyword)) ? 'critical' : 'minor';
  }

  private extractKeyFindings(result: unknown): string | undefined {
    if (typeof result === 'string') {
      return this.truncate(result, 200);
    }

    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>;
      if (typeof record.summary === 'string') {
        return this.truncate(record.summary, 200);
      }
      if (typeof record.keyFindings === 'string') {
        return this.truncate(record.keyFindings, 200);
      }
    }

    return undefined;
  }

  private summarizeValue(value: unknown): string {
    if (value === undefined || value === null) {
      return '';
    }

    if (typeof value === 'string') {
      return this.truncate(value, 500);
    }

    try {
      return this.truncate(JSON.stringify(value), 500);
    } catch {
      return this.truncate(String(value), 500);
    }
  }

  private buildFallbackSummary(
    results: ExecutionResult[],
    statistics: AggregatedResult['statistics'],
    failedTasks: AggregatedResult['failedTasks']
  ): string {
    const successCount = statistics.successfulTasks;
    const failureCount = statistics.failedTasks;
    const skippedCount = statistics.skippedTasks;
    const summaryParts = [`Completed ${successCount} of ${statistics.totalTasks} tasks.`];

    if (failureCount > 0) {
      summaryParts.push(`${failureCount} tasks failed.`);
    }
    if (skippedCount > 0) {
      summaryParts.push(`${skippedCount} tasks were skipped.`);
    }

    if (failedTasks && failedTasks.length > 0) {
      const criticalFailures = failedTasks.filter((task) => task.impact === 'critical');
      if (criticalFailures.length > 0) {
        summaryParts.push('Critical failures occurred in core tasks.');
      }
    }

    if (results.length === 0) {
      summaryParts.push('No task results were available.');
    }

    return summaryParts.join(' ');
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}...`;
  }
}
