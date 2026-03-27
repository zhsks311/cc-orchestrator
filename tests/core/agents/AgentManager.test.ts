import { describe, expect, it, vi } from 'vitest';

import { AgentManager } from '../../../src/core/agents/AgentManager.js';
import { AgentRole, AgentStatus, Priority } from '../../../src/types/agent.js';
import { AgentRuntimeKind } from '../../../src/types/runtime.js';

describe('AgentManager', () => {
  it('should propagate runtime metadata into AgentResult', () => {
    const manager = new AgentManager({
      executeWithFallback: vi.fn(),
    } as any);

    const agent = {
      id: 'agent-1',
      role: AgentRole.ARCH,
      task: 'draft a plan',
      status: AgentStatus.COMPLETED,
      context: {},
      createdAt: new Date('2026-03-26T00:00:00.000Z'),
      updatedAt: new Date('2026-03-26T00:00:01.000Z'),
      sessionId: 'session-1',
      priority: Priority.MEDIUM,
      executionTimeMs: 1000,
      runtimeKind: AgentRuntimeKind.CLAUDE_CODE,
      runtimeSessionId: 'runtime-session-1',
    };

    const result = (manager as any).buildAgentResult(agent);

    expect(result.runtimeKind).toBe(AgentRuntimeKind.CLAUDE_CODE);
    expect(result.runtimeSessionId).toBe('runtime-session-1');
  });
});
