/**
 * Agent Domain Types
 */

import { FallbackInfo } from './model.js';

export enum AgentRole {
  ARCH = 'arch',
  CANVAS = 'canvas',
  QUILL = 'quill',
  LENS = 'lens',
}

export enum AgentStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export interface AgentError {
  code: string;
  message: string;
  stack?: string;
  retryable: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface Agent {
  id: string;
  role: AgentRole;
  task: string;
  status: AgentStatus;
  context: Record<string, unknown>;
  result?: unknown;
  error?: AgentError;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  executionTimeMs?: number;
  modelUsed?: string;
  tokensUsed?: TokenUsage;
  sessionId: string;
  priority: Priority;
  /** Present if a provider fallback occurred */
  fallbackInfo?: FallbackInfo;
}

export interface CreateAgentParams {
  role: AgentRole;
  task: string;
  context?: Record<string, unknown>;
  priority?: Priority;
  sessionId: string;
  idempotencyKey?: string;
}

export interface AgentFilter {
  status?: AgentStatus[];
  role?: AgentRole[];
  sessionId?: string;
}

export interface AgentResult {
  agentId: string;
  status: AgentStatus;
  result?: unknown;
  error?: AgentError;
  executionTimeMs: number;
  tokensUsed?: TokenUsage;
  /** Present if a provider fallback occurred */
  fallbackInfo?: FallbackInfo;
}
