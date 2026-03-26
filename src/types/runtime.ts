/**
 * Runtime and adapter domain types
 */

export enum AgentRuntimeKind {
  CODEX = 'codex',
  CLAUDE_CODE = 'claude-code',
  GEMINI_CLI = 'gemini-cli',
  WRAPPER = 'wrapper',
}

export enum CapabilityKey {
  PLANNING = 'planning',
  IMPLEMENTATION = 'implementation',
  CODEBASE_SEARCH = 'codebase_search',
  PATCH_EDIT = 'patch_edit',
  SHELL_EXECUTION = 'shell_execution',
  MULTI_TURN_CHAT = 'multi_turn_chat',
  DEBATE_PARTICIPATION = 'debate_participation',
  STANCE_SIMULATION = 'stance_simulation',
  TRANSCRIPT_ACCESS = 'transcript_access',
}

export interface AdapterCapability {
  key: CapabilityKey;
  supported: boolean;
  details?: string;
}

export interface AgentAdapterDescriptor {
  id: string;
  runtime: AgentRuntimeKind;
  enabled: boolean;
  command: string;
  args?: string[];
  capabilities: CapabilityKey[];
  env?: Record<string, string>;
  cwdStrategy?: 'direct' | 'prefixed' | 'unsupported';
}
