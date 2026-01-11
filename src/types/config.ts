/**
 * Configuration Types
 */

import { ModelProvider, AgentRole } from './index.js';

export interface ProviderPriorityConfig {
  /** Global provider priority order */
  priority: ModelProvider[];
}

export interface RoleProviderConfig {
  /** Provider priority for this specific role */
  providers: ModelProvider[];
  /** Custom model overrides per provider */
  models?: Partial<Record<ModelProvider, string>>;
}

export interface CCOConfig {
  /** Provider configuration */
  providers: ProviderPriorityConfig;
  /** Role-specific overrides */
  roles?: Partial<Record<AgentRole, RoleProviderConfig>>;
  /** Config file path (for diagnostics) */
  configPath?: string;
  /** Source of configuration */
  source: 'default' | 'env' | 'file' | 'merged';
}

export const DEFAULT_PROVIDER_PRIORITY: ModelProvider[] = [
  ModelProvider.ANTHROPIC,
  ModelProvider.OPENAI,
  ModelProvider.GOOGLE,
];
