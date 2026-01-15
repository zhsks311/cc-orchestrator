/**
 * Orchestration Types
 */

import { AgentRole, Priority } from './agent.js';

export enum OrchestrationStatus {
  PLANNING = 'planning',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface Stage {
  id: string;
  name: string;
  role: AgentRole;
  task: string;
  dependsOn: string[];
  inputs: Record<string, string>;
  priority: Priority;
}

export interface ExecutionPlan {
  stages: Stage[];
  dependencies: Record<string, string[]>;
  estimatedDurationMs: number;
  estimatedCost?: number;
}

export interface Orchestration {
  id: string;
  goal: string;
  executionPlan: ExecutionPlan;
  status: OrchestrationStatus;
  agentIds: string[];
  result?: unknown;
  error?: Error;
  createdAt: Date;
  completedAt?: Date;
  totalExecutionTimeMs?: number;
  sessionId: string;
}

export interface OrchestrationParams {
  goal: string;
  constraints?: {
    maxDurationMs?: number;
    maxCost?: number;
    qualityLevel?: 'fast' | 'balanced' | 'thorough';
  };
  preferredRoles?: AgentRole[];
  sessionId: string;
}

export interface OrchestrationResult {
  orchestrationId: string;
  status: OrchestrationStatus;
  result?: unknown;
  error?: Error;
  totalExecutionTimeMs: number;
  stageResults: Record<string, unknown>;
}
