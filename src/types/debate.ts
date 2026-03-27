/**
 * Debate and stance simulation domain types
 */

export enum DebateThreadType {
  REVIEW = 'review',
  DEBATE = 'debate',
}

export enum DebateThreadStatus {
  OPEN = 'open',
  NEEDS_FOLLOWUP = 'needs_followup',
  RESOLVED = 'resolved',
  CANCELLED = 'cancelled',
}

export enum DebateResolutionStatus {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  SUPERSEDED = 'superseded',
}

export enum DebateStance {
  OPTIMIST = 'optimist',
  SKEPTIC = 'skeptic',
  IMPLEMENTER = 'implementer',
  REVIEWER = 'reviewer',
}

export interface DebateThread {
  id: string;
  type: DebateThreadType;
  status: DebateThreadStatus;
  sourceSessionId: string;
  participantSessionIds: string[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}
