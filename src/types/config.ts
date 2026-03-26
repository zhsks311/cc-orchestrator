/**
 * Configuration Types
 */

import { DebateStance } from './debate.js';
import { AgentRuntimeKind, CapabilityKey } from './runtime.js';

export interface HostConfig {
  transport: 'mcp-stdio';
}

export interface AdapterConfig {
  id: string;
  runtime: AgentRuntimeKind;
  enabled: boolean;
  command: string;
  args?: string[];
  capabilities: CapabilityKey[];
  env?: Record<string, string>;
}

export interface DefaultsConfig {
  primaryAdapter: string;
  fallbackAdapter?: string;
}

export interface DebateConfig {
  autoValidate: boolean;
  defaultParticipants: number;
  defaultStances: DebateStance[];
}

export interface WorkspacePolicyConfig {
  allowAbsolutePaths: boolean;
  preferIsolatedWorktrees: boolean;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  retainTranscripts: boolean;
}

export interface CCOConfig {
  host: HostConfig;
  adapters: Record<string, AdapterConfig>;
  defaults: DefaultsConfig;
  debate: DebateConfig;
  workspacePolicy: WorkspacePolicyConfig;
  logging: LoggingConfig;
  /** Config file path (for diagnostics) */
  configPath?: string;
  /** Source of configuration */
  source: 'default' | 'env' | 'file' | 'merged';
}

export const DEFAULT_ADAPTER_CONFIGS: Record<string, AdapterConfig> = {
  codex: {
    id: 'codex',
    runtime: AgentRuntimeKind.CODEX,
    enabled: true,
    command: 'codex',
    capabilities: [
      CapabilityKey.PLANNING,
      CapabilityKey.IMPLEMENTATION,
      CapabilityKey.PATCH_EDIT,
      CapabilityKey.SHELL_EXECUTION,
      CapabilityKey.MULTI_TURN_CHAT,
      CapabilityKey.TRANSCRIPT_ACCESS,
    ],
  },
  claude_code: {
    id: 'claude-code',
    runtime: AgentRuntimeKind.CLAUDE_CODE,
    enabled: true,
    command: 'claude',
    capabilities: [
      CapabilityKey.PLANNING,
      CapabilityKey.IMPLEMENTATION,
      CapabilityKey.CODEBASE_SEARCH,
      CapabilityKey.PATCH_EDIT,
      CapabilityKey.SHELL_EXECUTION,
      CapabilityKey.MULTI_TURN_CHAT,
      CapabilityKey.DEBATE_PARTICIPATION,
      CapabilityKey.STANCE_SIMULATION,
      CapabilityKey.TRANSCRIPT_ACCESS,
    ],
  },
};
