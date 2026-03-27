/**
 * Artifact domain types
 */

export type ArtifactKind = 'summary' | 'transcript' | 'file' | 'patch' | 'report';

export interface ArtifactReference {
  id: string;
  sessionId: string;
  kind: ArtifactKind;
  title: string;
  createdAt: Date;
  path?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}
