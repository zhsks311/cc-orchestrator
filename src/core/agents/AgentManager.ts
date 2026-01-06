/**
 * Agent Manager - Manages agent lifecycle
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Agent,
  AgentStatus,
  Priority,
  CreateAgentParams,
  AgentFilter,
  AgentResult,
  AgentError,
} from '../../types/index.js';
import { AgentNotFoundError, TimeoutError } from '../../types/errors.js';
import { ModelRouter, IModelRouter } from '../models/ModelRouter.js';
import { Logger } from '../../infrastructure/Logger.js';

export interface IAgentManager {
  createAgent(params: CreateAgentParams): Promise<Agent>;
  getAgent(agentId: string): Promise<Agent>;
  listAgents(filter?: AgentFilter): Promise<Agent[]>;
  waitForCompletion(agentId: string, timeoutMs: number): Promise<AgentResult>;
  cancelAgent(agentId: string): Promise<void>;
  updateAgentStatus(
    agentId: string,
    status: AgentStatus,
    data?: Partial<Agent>
  ): Promise<void>;
}

export class AgentManager implements IAgentManager {
  private agents: Map<string, Agent> = new Map();
  private idempotencyCache: Map<string, string> = new Map();
  private executionPromises: Map<string, Promise<void>> = new Map();
  private modelRouter: IModelRouter;
  private logger: Logger;
  private maxConcurrentAgents: number;

  constructor(modelRouter?: IModelRouter) {
    this.modelRouter = modelRouter ?? new ModelRouter();
    this.logger = new Logger('AgentManager');
    this.maxConcurrentAgents = parseInt(
      process.env.CCO_MAX_PARALLEL_AGENTS ?? '5',
      10
    );
  }

  async createAgent(params: CreateAgentParams): Promise<Agent> {
    // Check idempotency
    if (params.idempotencyKey) {
      const existingAgentId = this.idempotencyCache.get(params.idempotencyKey);
      if (existingAgentId) {
        this.logger.debug('Returning existing agent for idempotency key', {
          idempotencyKey: params.idempotencyKey,
          agentId: existingAgentId,
        });
        return this.getAgent(existingAgentId);
      }
    }

    const now = new Date();
    const agent: Agent = {
      id: uuidv4(),
      role: params.role,
      task: params.task,
      status: AgentStatus.QUEUED,
      context: params.context ?? {},
      priority: params.priority ?? Priority.MEDIUM,
      sessionId: params.sessionId,
      createdAt: now,
      updatedAt: now,
    };

    this.agents.set(agent.id, agent);

    // Store idempotency mapping
    if (params.idempotencyKey) {
      this.idempotencyCache.set(params.idempotencyKey, agent.id);
    }

    this.logger.info('Agent created', {
      agentId: agent.id,
      role: agent.role,
      sessionId: agent.sessionId,
    });

    // Start execution asynchronously
    this.startExecution(agent);

    return agent;
  }

  async getAgent(agentId: string): Promise<Agent> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new AgentNotFoundError(agentId);
    }
    return agent;
  }

  async listAgents(filter?: AgentFilter): Promise<Agent[]> {
    let agents = Array.from(this.agents.values());

    if (filter) {
      if (filter.sessionId) {
        agents = agents.filter((a) => a.sessionId === filter.sessionId);
      }
      if (filter.status && filter.status.length > 0) {
        agents = agents.filter((a) => filter.status!.includes(a.status));
      }
      if (filter.role && filter.role.length > 0) {
        agents = agents.filter((a) => filter.role!.includes(a.role));
      }
    }

    return agents.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async waitForCompletion(
    agentId: string,
    timeoutMs: number
  ): Promise<AgentResult> {
    const agent = await this.getAgent(agentId);

    // Already completed
    if (this.isTerminalStatus(agent.status)) {
      return this.buildAgentResult(agent);
    }

    // Wait for execution to complete
    const executionPromise = this.executionPromises.get(agentId);
    if (executionPromise) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(`wait_agent(${agentId})`, timeoutMs));
        }, timeoutMs);
      });

      try {
        await Promise.race([executionPromise, timeoutPromise]);
      } catch (error) {
        if (error instanceof TimeoutError) {
          await this.updateAgentStatus(agentId, AgentStatus.TIMEOUT);
          throw error;
        }
        throw error;
      }
    }

    const completedAgent = await this.getAgent(agentId);
    return this.buildAgentResult(completedAgent);
  }

  async cancelAgent(agentId: string): Promise<void> {
    const agent = await this.getAgent(agentId);

    if (this.isTerminalStatus(agent.status)) {
      this.logger.warn('Cannot cancel agent in terminal status', {
        agentId,
        status: agent.status,
      });
      return;
    }

    await this.updateAgentStatus(agentId, AgentStatus.CANCELLED);
    this.logger.info('Agent cancelled', { agentId });
  }

  async updateAgentStatus(
    agentId: string,
    status: AgentStatus,
    data?: Partial<Agent>
  ): Promise<void> {
    const agent = await this.getAgent(agentId);

    agent.status = status;
    agent.updatedAt = new Date();

    if (data) {
      Object.assign(agent, data);
    }

    if (this.isTerminalStatus(status)) {
      agent.completedAt = new Date();
      if (agent.startedAt) {
        agent.executionTimeMs =
          agent.completedAt.getTime() - agent.startedAt.getTime();
      }
    }

    this.agents.set(agentId, agent);
  }

  private startExecution(agent: Agent): void {
    const executionPromise = this.executeAgent(agent);
    this.executionPromises.set(agent.id, executionPromise);

    executionPromise.finally(() => {
      this.executionPromises.delete(agent.id);
    });
  }

  private async executeAgent(agent: Agent): Promise<void> {
    try {
      await this.updateAgentStatus(agent.id, AgentStatus.RUNNING, {
        startedAt: new Date(),
      });

      // Execute agent using model router
      const response = await this.modelRouter.executeWithFallback({
        role: agent.role,
        task: agent.task,
        context: agent.context,
      });

      await this.updateAgentStatus(agent.id, AgentStatus.COMPLETED, {
        result: response.content,
        modelUsed: response.model,
        tokensUsed: response.tokensUsed,
      });

      this.logger.info('Agent execution completed', {
        agentId: agent.id,
        role: agent.role,
        tokensUsed: response.tokensUsed,
      });
    } catch (error) {
      const agentError: AgentError = {
        code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        retryable: false,
      };

      await this.updateAgentStatus(agent.id, AgentStatus.FAILED, {
        error: agentError,
      });

      this.logger.error('Agent execution failed', {
        agentId: agent.id,
        role: agent.role,
        error: agentError,
      });
    }
  }

  private isTerminalStatus(status: AgentStatus): boolean {
    return [
      AgentStatus.COMPLETED,
      AgentStatus.FAILED,
      AgentStatus.CANCELLED,
      AgentStatus.TIMEOUT,
    ].includes(status);
  }

  private buildAgentResult(agent: Agent): AgentResult {
    return {
      agentId: agent.id,
      status: agent.status,
      result: agent.result,
      error: agent.error,
      executionTimeMs: agent.executionTimeMs ?? 0,
      tokensUsed: agent.tokensUsed,
    };
  }

  // Cleanup methods
  getRunningAgentsCount(): number {
    return Array.from(this.agents.values()).filter(
      (a) => a.status === AgentStatus.RUNNING
    ).length;
  }

  async cleanupSession(sessionId: string): Promise<void> {
    const sessionAgents = await this.listAgents({ sessionId });

    for (const agent of sessionAgents) {
      if (!this.isTerminalStatus(agent.status)) {
        await this.cancelAgent(agent.id);
      }
      this.agents.delete(agent.id);
    }

    // Cleanup idempotency cache for session
    for (const [key, agentId] of this.idempotencyCache.entries()) {
      const agent = this.agents.get(agentId);
      if (!agent || agent.sessionId === sessionId) {
        this.idempotencyCache.delete(key);
      }
    }

    this.logger.info('Session cleanup completed', { sessionId });
  }
}
