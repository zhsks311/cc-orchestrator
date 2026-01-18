/**
 * Context Store - Manages session and global context
 */

import {
  ContextEntry,
  ContextScope,
  SetContextParams,
  GetContextParams,
} from '../../types/index.js';
import { ContextNotFoundError } from '../../types/errors.js';
import { Logger } from '../../infrastructure/Logger.js';

export interface IContextStore {
  set(params: SetContextParams): Promise<void>;
  get(params: GetContextParams): Promise<ContextEntry>;
  delete(params: GetContextParams): Promise<void>;
  listBySession(sessionId: string): Promise<ContextEntry[]>;
  cleanupExpired(): Promise<number>;
}

export class ContextStore implements IContextStore {
  private store: Map<string, ContextEntry> = new Map();
  private logger: Logger;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.logger = new Logger('ContextStore');
    this.startCleanupScheduler();
  }

  async set(params: SetContextParams): Promise<void> {
    const key = this.buildKey(params.key, params.scope, params.sessionId);
    const now = new Date();

    const entry: ContextEntry = {
      key: params.key,
      value: params.value,
      scope: params.scope,
      sessionId: params.sessionId,
      createdAt: now,
      expiresAt: params.ttlSeconds ? new Date(now.getTime() + params.ttlSeconds * 1000) : undefined,
      accessCount: 0,
      lastAccessedAt: now,
    };

    this.store.set(key, entry);

    this.logger.debug('Context set', {
      key: params.key,
      scope: params.scope,
      sessionId: params.sessionId,
      ttlSeconds: params.ttlSeconds,
    });
  }

  async get(params: GetContextParams): Promise<ContextEntry> {
    const key = this.buildKey(params.key, params.scope, params.sessionId);
    const entry = this.store.get(key);

    if (!entry) {
      throw new ContextNotFoundError(params.key);
    }

    // Check expiration
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.store.delete(key);
      throw new ContextNotFoundError(params.key);
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessedAt = new Date();

    return entry;
  }

  async delete(params: GetContextParams): Promise<void> {
    const key = this.buildKey(params.key, params.scope, params.sessionId);
    const deleted = this.store.delete(key);

    if (deleted) {
      this.logger.debug('Context deleted', {
        key: params.key,
        scope: params.scope,
        sessionId: params.sessionId,
      });
    }
  }

  async listBySession(sessionId: string): Promise<ContextEntry[]> {
    const entries: ContextEntry[] = [];
    const now = new Date();

    for (const entry of this.store.values()) {
      if (entry.sessionId === sessionId) {
        // Skip expired entries
        if (entry.expiresAt && now > entry.expiresAt) {
          continue;
        }
        entries.push(entry);
      }
    }

    return entries.sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());
  }

  async cleanupExpired(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug('Expired contexts cleaned up', { count: cleanedCount });
    }

    return cleanedCount;
  }

  async cleanupSession(sessionId: string): Promise<void> {
    let cleanedCount = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.sessionId === sessionId) {
        this.store.delete(key);
        cleanedCount++;
      }
    }

    this.logger.info('Session contexts cleaned up', {
      sessionId,
      count: cleanedCount,
    });
  }

  private buildKey(key: string, scope: ContextScope, sessionId: string): string {
    return `${scope}:${sessionId}:${key}`;
  }

  private startCleanupScheduler(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpired().catch((error) => {
          this.logger.error('Cleanup scheduler error', { error });
        });
      },
      5 * 60 * 1000
    );
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Stats
  getStats(): { total: number; byScope: Record<ContextScope, number> } {
    const stats = {
      total: this.store.size,
      byScope: {
        [ContextScope.SESSION]: 0,
        [ContextScope.GLOBAL]: 0,
      },
    };

    for (const entry of this.store.values()) {
      stats.byScope[entry.scope]++;
    }

    return stats;
  }
}
