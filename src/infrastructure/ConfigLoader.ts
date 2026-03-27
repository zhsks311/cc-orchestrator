/**
 * Configuration Loader
 * Loads runtime-first orchestration configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  CCOConfig,
  AdapterConfig,
  CapabilityKey,
  DebateStance,
  AgentRuntimeKind,
  DEFAULT_ADAPTER_CONFIGS,
} from '../types/index.js';
import { ConfigurationError } from '../types/errors.js';
import { Logger } from './Logger.js';

const CONFIG_DIR = '.cco';
const CONFIG_FILE = 'config.json';

type ConfigOverride = {
  host?: CCOConfig['host'];
  adapters?: Record<string, AdapterConfig>;
  defaults?: Partial<CCOConfig['defaults']>;
  debate?: Partial<CCOConfig['debate']>;
  workspacePolicy?: Partial<CCOConfig['workspacePolicy']>;
  logging?: Partial<CCOConfig['logging']>;
  configPath?: string;
};

export class ConfigLoader {
  private config: CCOConfig;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ConfigLoader');
    this.config = this.loadConfig();
  }

  /**
   * Get the loaded configuration
   */
  getConfig(): CCOConfig {
    return this.config;
  }

  getAdapterConfigs(): AdapterConfig[] {
    const adapters = Object.values(this.config.adapters).filter((adapter) => adapter.enabled);
    const primary = this.config.defaults.primaryAdapter;
    const fallback = this.config.defaults.fallbackAdapter;

    return adapters.sort((left, right) => {
      const leftRank = this.getAdapterRank(left.id, primary, fallback);
      const rightRank = this.getAdapterRank(right.id, primary, fallback);
      return leftRank - rightRank || left.id.localeCompare(right.id);
    });
  }

  /**
   * Reload configuration from sources
   */
  reload(): CCOConfig {
    this.config = this.loadConfig();
    return this.config;
  }

  private loadConfig(): CCOConfig {
    let config = this.createDefaultRuntimeConfig();

    const fileConfig = this.loadFromFile();
    if (fileConfig) {
      config = this.mergeConfigs(config, fileConfig);
      config.source = 'file';
    }

    const envConfig = this.loadFromEnv();
    if (envConfig) {
      config = this.mergeConfigs(config, envConfig);
      config.source = fileConfig ? 'merged' : 'env';
    }

    this.logger.info('Configuration loaded', {
      source: config.source,
      primaryAdapter: config.defaults.primaryAdapter,
      enabledAdapters: this.getEnabledAdapterIds(config),
      configPath: config.configPath,
    });

    return config;
  }

  private loadFromFile(): ConfigOverride | null {
    const configPath = this.getConfigPath();

    if (!fs.existsSync(configPath)) {
      this.logger.debug('No config file found', { path: configPath });
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      const config: ConfigOverride = {
        configPath,
      };

      if (parsed.host?.transport === 'mcp-stdio') {
        config.host = { transport: 'mcp-stdio' };
      }

      if (parsed.defaults && typeof parsed.defaults === 'object') {
        const defaults: ConfigOverride['defaults'] = {};
        if (parsed.defaults.primaryAdapter !== undefined) {
          defaults.primaryAdapter = this.normalizeAdapterId(String(parsed.defaults.primaryAdapter));
        }
        if (parsed.defaults.fallbackAdapter !== undefined) {
          defaults.fallbackAdapter = this.normalizeAdapterId(
            String(parsed.defaults.fallbackAdapter)
          );
        }
        if (Object.keys(defaults).length > 0) {
          config.defaults = defaults;
        }
      }

      if (parsed.debate && typeof parsed.debate === 'object') {
        config.debate = {
          autoValidate: parsed.debate.autoValidate !== false,
          defaultParticipants: this.parsePositiveInt(parsed.debate.defaultParticipants, 2),
          defaultStances: this.parseStances(parsed.debate.defaultStances),
        };
      }

      if (parsed.workspacePolicy && typeof parsed.workspacePolicy === 'object') {
        config.workspacePolicy = {
          allowAbsolutePaths: parsed.workspacePolicy.allowAbsolutePaths !== false,
          preferIsolatedWorktrees: parsed.workspacePolicy.preferIsolatedWorktrees !== false,
        };
      }

      if (parsed.logging && typeof parsed.logging === 'object') {
        config.logging = {
          level: this.parseLogLevel(parsed.logging.level),
          retainTranscripts: parsed.logging.retainTranscripts !== false,
        };
      }

      if (parsed.adapters && typeof parsed.adapters === 'object') {
        config.adapters = this.parseAdapters(parsed.adapters as Record<string, unknown>);
      }

      this.logger.debug('Config loaded from file', { path: configPath });
      return config;
    } catch (error) {
      if (error instanceof ConfigurationError) {
        this.logger.error('Invalid config file', { path: configPath, error: error.toJSON() });
        throw error;
      }

      if (error instanceof SyntaxError) {
        throw new ConfigurationError(`Invalid JSON in config file: ${configPath}`);
      }

      if (error instanceof Error) {
        throw new ConfigurationError(`Failed to load config file ${configPath}: ${error.message}`);
      }

      throw new ConfigurationError(`Failed to load config file ${configPath}`);
    }
  }

  private loadFromEnv(): ConfigOverride | null {
    const primaryAdapter = process.env.CCO_PRIMARY_ADAPTER;
    const fallbackAdapter = process.env.CCO_FALLBACK_ADAPTER;
    if (!primaryAdapter && !fallbackAdapter) {
      return null;
    }

    const defaults: NonNullable<ConfigOverride['defaults']> = {};
    if (primaryAdapter) {
      defaults.primaryAdapter = this.normalizeAdapterId(primaryAdapter);
    }
    if (fallbackAdapter) {
      defaults.fallbackAdapter = this.normalizeAdapterId(fallbackAdapter);
    }

    const config: ConfigOverride = { defaults };

    this.logger.debug('Config loaded from environment', {
      primaryAdapter,
      fallbackAdapter,
    });

    return config;
  }

  private mergeConfigs(base: CCOConfig, override: ConfigOverride): CCOConfig {
    const merged: CCOConfig = { ...base };

    if (override.host) {
      merged.host = override.host;
    }

    if (override.defaults) {
      merged.defaults = {
        ...base.defaults,
        ...override.defaults,
        primaryAdapter:
          override.defaults.primaryAdapter !== undefined
            ? this.normalizeAdapterId(override.defaults.primaryAdapter)
            : base.defaults.primaryAdapter,
        fallbackAdapter:
          override.defaults.fallbackAdapter !== undefined
            ? this.normalizeAdapterId(override.defaults.fallbackAdapter)
            : base.defaults.fallbackAdapter,
      };
    }

    if (override.debate) {
      merged.debate = { ...base.debate, ...override.debate };
    }

    if (override.workspacePolicy) {
      merged.workspacePolicy = {
        ...base.workspacePolicy,
        ...override.workspacePolicy,
      };
    }

    if (override.logging) {
      merged.logging = { ...base.logging, ...override.logging };
    }

    if (override.adapters) {
      merged.adapters = { ...base.adapters };
      for (const [key, value] of Object.entries(override.adapters)) {
        const normalizedKey = this.normalizeAdapterKey(key);
        merged.adapters[normalizedKey] = {
          ...merged.adapters[normalizedKey],
          ...value,
        };
      }
    }

    if (override.configPath) {
      merged.configPath = override.configPath;
    }

    return merged;
  }

  private parseAdapters(adapters: Record<string, unknown>): Record<string, AdapterConfig> {
    const parsedAdapters: Record<string, AdapterConfig> = {};

    for (const [key, value] of Object.entries(adapters)) {
      if (typeof value !== 'object' || value === null) {
        continue;
      }

      const raw = value as Record<string, unknown>;
      const normalizedKey = this.normalizeAdapterKey(key);
      const defaultAdapter = DEFAULT_ADAPTER_CONFIGS[normalizedKey];
      const normalizedId = this.normalizeAdapterId(String(raw.id ?? defaultAdapter?.id ?? key));
      const runtime =
        raw.runtime !== undefined
          ? this.parseRuntime(raw.runtime)
          : (defaultAdapter?.runtime ??
            (() => {
              throw new ConfigurationError(`Adapter ${normalizedId} must declare a runtime`);
            })());

      parsedAdapters[normalizedKey] = {
        id: normalizedId,
        runtime,
        enabled:
          raw.enabled !== undefined ? raw.enabled !== false : (defaultAdapter?.enabled ?? true),
        command: String(raw.command ?? defaultAdapter?.command ?? normalizedId),
        args: Array.isArray(raw.args)
          ? raw.args.map((item) => String(item))
          : defaultAdapter?.args
            ? [...defaultAdapter.args]
            : undefined,
        capabilities:
          raw.capabilities !== undefined
            ? this.parseCapabilities(raw.capabilities)
            : defaultAdapter?.capabilities
              ? [...defaultAdapter.capabilities]
              : [],
        env:
          raw.env && typeof raw.env === 'object'
            ? Object.fromEntries(
                Object.entries(raw.env as Record<string, unknown>).map(([envKey, envValue]) => [
                  envKey,
                  String(envValue),
                ])
              )
            : defaultAdapter?.env
              ? { ...defaultAdapter.env }
              : undefined,
      };
    }

    return parsedAdapters;
  }

  private parseRuntime(value: unknown): AgentRuntimeKind {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    const canonical = normalized.replace(/_/g, '-');
    if (canonical === 'claude') {
      return AgentRuntimeKind.CLAUDE_CODE;
    }
    const runtimes = Object.values(AgentRuntimeKind);
    if (runtimes.includes(canonical as AgentRuntimeKind)) {
      return canonical as AgentRuntimeKind;
    }

    throw new ConfigurationError(`Unknown adapter runtime: ${value}`);
  }

  private parseCapabilities(value: unknown): CapabilityKey[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const capabilityValues = Object.values(CapabilityKey);
    return value.map((item) => {
      const normalized = String(item).trim().toLowerCase().replace(/-/g, '_');
      if (!capabilityValues.includes(normalized as CapabilityKey)) {
        throw new ConfigurationError(`Unknown adapter capability: ${item}`);
      }
      return normalized as CapabilityKey;
    });
  }

  private getConfigPath(): string {
    const customPath = process.env.CCO_CONFIG_PATH;
    if (customPath) {
      return customPath;
    }

    const homeDir = os.homedir();
    return path.join(homeDir, CONFIG_DIR, CONFIG_FILE);
  }

  static createDefaultConfig(): string {
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, CONFIG_DIR);
    const configPath = path.join(configDir, CONFIG_FILE);

    // Create directory if needed
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (!fs.existsSync(configPath)) {
      const defaultConfig: Omit<CCOConfig, 'configPath' | 'source'> = {
        host: {
          transport: 'mcp-stdio',
        },
        adapters: DEFAULT_ADAPTER_CONFIGS,
        defaults: {
          primaryAdapter: 'codex',
          fallbackAdapter: 'claude-code',
        },
        debate: {
          autoValidate: true,
          defaultParticipants: 2,
          defaultStances: [DebateStance.SKEPTIC, DebateStance.IMPLEMENTER, DebateStance.REVIEWER],
        },
        workspacePolicy: {
          allowAbsolutePaths: true,
          preferIsolatedWorktrees: true,
        },
        logging: {
          level: 'info',
          retainTranscripts: true,
        },
      };

      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }

    return configPath;
  }

  private createDefaultRuntimeConfig(): CCOConfig {
    return {
      host: {
        transport: 'mcp-stdio',
      },
      adapters: { ...DEFAULT_ADAPTER_CONFIGS },
      defaults: {
        primaryAdapter: 'codex',
        fallbackAdapter: 'claude-code',
      },
      debate: {
        autoValidate: true,
        defaultParticipants: 2,
        defaultStances: [DebateStance.SKEPTIC, DebateStance.IMPLEMENTER, DebateStance.REVIEWER],
      },
      workspacePolicy: {
        allowAbsolutePaths: true,
        preferIsolatedWorktrees: true,
      },
      logging: {
        level: 'info',
        retainTranscripts: true,
      },
      source: 'default',
    };
  }

  private getEnabledAdapterIds(config: CCOConfig): string[] {
    return Object.values(config.adapters)
      .filter((adapter) => adapter.enabled)
      .map((adapter) => adapter.id);
  }

  private getAdapterRank(adapterId: string, primary: string, fallback?: string): number {
    if (adapterId === primary) {
      return 0;
    }
    if (fallback && adapterId === fallback) {
      return 1;
    }
    return 2;
  }

  private normalizeAdapterId(value: string): string {
    return value.trim().toLowerCase().replace(/_/g, '-');
  }

  private normalizeAdapterKey(value: string): string {
    return this.normalizeAdapterId(value).replace(/-/g, '_');
  }

  private parsePositiveInt(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    return fallback;
  }

  private parseLogLevel(value: unknown): 'debug' | 'info' | 'warn' | 'error' {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (
      normalized === 'debug' ||
      normalized === 'info' ||
      normalized === 'warn' ||
      normalized === 'error'
    ) {
      return normalized;
    }
    return 'info';
  }

  private parseStances(value: unknown): DebateStance[] {
    if (!Array.isArray(value)) {
      return this.getDefaultStances();
    }

    const stanceValues = Object.values(DebateStance);
    const stances = value.map((item) => {
      const normalized = String(item).trim().toLowerCase();
      if (!stanceValues.includes(normalized as DebateStance)) {
        throw new ConfigurationError(`Unknown debate stance: ${item}`);
      }
      return normalized as DebateStance;
    });

    return stances.length > 0 ? stances : this.getDefaultStances();
  }

  private getDefaultStances(): DebateStance[] {
    return [DebateStance.SKEPTIC, DebateStance.IMPLEMENTER, DebateStance.REVIEWER];
  }
}
