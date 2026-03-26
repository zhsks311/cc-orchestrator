import { describe, expect, it } from 'vitest';

import {
  AgentRuntimeKind,
  CapabilityKey,
  SessionStatus,
  TranscriptEventType,
  DebateThreadStatus,
  DebateThreadType,
  DebateResolutionStatus,
  type AdapterCapability,
  type ArtifactReference,
  type DebateThread,
  type SessionMessage,
} from '../../../src/types/index.js';
import {
  AdapterNotFoundError,
  AdapterUnavailableError,
  SessionNotFoundError,
  DebateThreadNotFoundError,
  DebatePolicyViolationError,
} from '../../../src/types/errors.js';

describe('runtime-first domain types', () => {
  it('should expose supported runtime kinds', () => {
    expect(AgentRuntimeKind.CODEX).toBe('codex');
    expect(AgentRuntimeKind.CLAUDE_CODE).toBe('claude-code');
  });

  it('should allow capability descriptors', () => {
    const capability: AdapterCapability = {
      key: CapabilityKey.DEBATE_PARTICIPATION,
      supported: true,
      details: 'Can review and challenge plans',
    };

    expect(capability.key).toBe('debate_participation');
    expect(capability.supported).toBe(true);
  });

  it('should represent runtime session messages and transcript events', () => {
    const message: SessionMessage = {
      id: 'message-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'Challenge this plan',
      createdAt: new Date(),
    };

    expect(message.role).toBe('user');
    expect(TranscriptEventType.MESSAGE_CREATED).toBe('message_created');
    expect(SessionStatus.RUNNING).toBe('running');
  });

  it('should describe artifacts and debate threads', () => {
    const artifact: ArtifactReference = {
      id: 'artifact-1',
      sessionId: 'session-1',
      kind: 'summary',
      title: 'Plan summary',
      createdAt: new Date(),
    };

    const thread: DebateThread = {
      id: 'thread-1',
      type: DebateThreadType.REVIEW,
      status: DebateThreadStatus.OPEN,
      sourceSessionId: 'session-1',
      participantSessionIds: ['session-2'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(artifact.kind).toBe('summary');
    expect(thread.type).toBe('review');
    expect(DebateResolutionStatus.ACCEPTED).toBe('accepted');
  });
});

describe('runtime-first error classes', () => {
  it('should expose adapter and session specific errors', () => {
    const missingAdapter = new AdapterNotFoundError('codex');
    const unavailableAdapter = new AdapterUnavailableError('claude-code');
    const missingSession = new SessionNotFoundError('session-1');
    const missingThread = new DebateThreadNotFoundError('thread-1');
    const policyViolation = new DebatePolicyViolationError('No self-review loops');

    expect(missingAdapter.code).toBe('ADAPTER_NOT_FOUND');
    expect(unavailableAdapter.code).toBe('ADAPTER_UNAVAILABLE');
    expect(missingSession.code).toBe('SESSION_NOT_FOUND');
    expect(missingThread.code).toBe('DEBATE_THREAD_NOT_FOUND');
    expect(policyViolation.code).toBe('DEBATE_POLICY_VIOLATION');
  });
});
