/**
 * Session domain types
 */

export enum SessionStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  WAITING_INPUT = 'waiting_input',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
}

export type SessionMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: SessionMessageRole;
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export enum TranscriptEventType {
  SESSION_CREATED = 'session_created',
  MESSAGE_CREATED = 'message_created',
  STATUS_CHANGED = 'status_changed',
  ARTIFACT_ATTACHED = 'artifact_attached',
  THREAD_LINKED = 'thread_linked',
}

export interface SessionTranscriptEvent {
  id: string;
  sessionId: string;
  type: TranscriptEventType;
  createdAt: Date;
  messageId?: string;
  payload?: Record<string, unknown>;
}
