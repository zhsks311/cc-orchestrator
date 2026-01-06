/**
 * Context Store Types
 */

export enum ContextScope {
  SESSION = 'session',
  GLOBAL = 'global',
}

export interface ContextEntry {
  key: string;
  value: unknown;
  scope: ContextScope;
  sessionId: string;
  createdAt: Date;
  expiresAt?: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

export interface SetContextParams {
  key: string;
  value: unknown;
  scope: ContextScope;
  sessionId: string;
  ttlSeconds?: number;
}

export interface GetContextParams {
  key: string;
  scope: ContextScope;
  sessionId: string;
}
