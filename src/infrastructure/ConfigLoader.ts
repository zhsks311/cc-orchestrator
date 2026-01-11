/**
 * Configuration Loader
 * Loads and merges configuration from environment variables and config files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  CCOConfig,
  ProviderPriorityConfig,
  RoleProviderConfig,
  ModelProvider,
  AgentRole,
  DEFAULT_PROVIDER_PRIORITY,
} from '../types/index.js';
import { Logger } from './Logger.js';

const CONFIG_DIR = '.cco';
const CONFIG_FILE = 'config.json';

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

  /**
   * Get provider priority for a specific role
   * Role-specific config takes precedence over global config
   */
  getProviderPriority(role?: AgentRole): ModelProvider[] {
    if (role && this.config.roles?.[role]?.providers) {
      return this.config.roles[role]!.providers;
    }
    return this.config.providers.priority;
  }

  /**
   * Get custom model for a role and provider (if configured)
   */
  getCustomModel(role: AgentRole, provider: ModelProvider): string | undefined {
    return this.config.roles?.[role]?.models?.[provider];
  }

  /**
   * Reload configuration from sources
   */
  reload(): CCOConfig {
    this.config = this.loadConfig();
    return this.config;
  }

  private loadConfig(): CCOConfig {
    // Start with default config
    let config: CCOConfig = {
      providers: { priority: [...DEFAULT_PROVIDER_PRIORITY] },
      source: 'default',
    };

    // Try to load from file
    const fileConfig = this.loadFromFile();
    if (fileConfig) {
      config = this.mergeConfigs(config, fileConfig);
      config.source = 'file';
    }

    // Override with environment variables (highest priority)
    const envConfig = this.loadFromEnv();
    if (envConfig) {
      config = this.mergeConfigs(config, envConfig);
      config.source = fileConfig ? 'merged' : 'env';
    }

    this.logger.info('Configuration loaded', {
      source: config.source,
      providerPriority: config.providers.priority,
      configPath: config.configPath,
    });

    return config;
  }

  private loadFromFile(): Partial<CCOConfig> | null {
    const configPath = this.getConfigPath();

    if (!fs.existsSync(configPath)) {
      this.logger.debug('No config file found', { path: configPath });
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate and transform
      const config: Partial<CCOConfig> = {
        configPath,
      };

      if (parsed.providers?.priority && Array.isArray(parsed.providers.priority)) {
        config.providers = {
          priority: this.parseProviderList(parsed.providers.priority),
        };
      }

      if (parsed.roles && typeof parsed.roles === 'object') {
        config.roles = this.parseRolesConfig(parsed.roles);
      }

      this.logger.debug('Config loaded from file', { path: configPath });
      return config;
    } catch (error) {
      this.logger.warn('Failed to load config file', { path: configPath, error });
      return null;
    }
  }

  private loadFromEnv(): Partial<CCOConfig> | null {
    const envPriority = process.env.CCO_PROVIDER_PRIORITY;
    if (!envPriority) {
      return null;
    }

    const providers = this.parseProviderList(envPriority.split(','));
    if (providers.length === 0) {
      return null;
    }

    const config: Partial<CCOConfig> = {
      providers: { priority: providers },
    };

    // Check for role-specific environment variables
    const roleEnvVars: Partial<Record<AgentRole, RoleProviderConfig>> = {};

    for (const role of Object.values(AgentRole)) {
      const envKey = `CCO_${role.toUpperCase()}_PROVIDERS`;
      const roleProviders = process.env[envKey];
      if (roleProviders) {
        roleEnvVars[role] = {
          providers: this.parseProviderList(roleProviders.split(',')),
        };
      }
    }

    if (Object.keys(roleEnvVars).length > 0) {
      config.roles = roleEnvVars;
    }

    this.logger.debug('Config loaded from environment', {
      priority: providers,
      roleOverrides: Object.keys(roleEnvVars),
    });

    return config;
  }

  private mergeConfigs(base: CCOConfig, override: Partial<CCOConfig>): CCOConfig {
    const merged: CCOConfig = { ...base };

    if (override.providers) {
      merged.providers = override.providers;
    }

    if (override.roles) {
      merged.roles = { ...base.roles, ...override.roles };
    }

    if (override.configPath) {
      merged.configPath = override.configPath;
    }

    return merged;
  }

  private parseProviderList(list: string[]): ModelProvider[] {
    const validProviders: ModelProvider[] = [];
    const providerValues = Object.values(ModelProvider);

    for (const item of list) {
      const normalized = item.trim().toLowerCase();
      if (providerValues.includes(normalized as ModelProvider)) {
        validProviders.push(normalized as ModelProvider);
      } else {
        this.logger.warn('Unknown provider in config', { provider: item });
      }
    }

    return validProviders;
  }

  private parseRolesConfig(
    roles: Record<string, unknown>
  ): Partial<Record<AgentRole, RoleProviderConfig>> {
    const result: Partial<Record<AgentRole, RoleProviderConfig>> = {};
    const validRoles = Object.values(AgentRole);

    for (const [key, value] of Object.entries(roles)) {
      const normalizedKey = key.toLowerCase();
      if (!validRoles.includes(normalizedKey as AgentRole)) {
        this.logger.warn('Unknown role in config', { role: key });
        continue;
      }

      if (typeof value !== 'object' || value === null) continue;

      const roleConfig = value as Record<string, unknown>;
      const parsedConfig: RoleProviderConfig = {
        providers: [],
      };

      if (Array.isArray(roleConfig.providers)) {
        parsedConfig.providers = this.parseProviderList(
          roleConfig.providers as string[]
        );
      }

      if (roleConfig.models && typeof roleConfig.models === 'object') {
        parsedConfig.models = roleConfig.models as Partial<
          Record<ModelProvider, string>
        >;
      }

      if (parsedConfig.providers.length > 0) {
        result[normalizedKey as AgentRole] = parsedConfig;
      }
    }

    return result;
  }

  private getConfigPath(): string {
    // Check for custom config path
    const customPath = process.env.CCO_CONFIG_PATH;
    if (customPath) {
      return customPath;
    }

    // Default to ~/.cco/config.json
    const homeDir = os.homedir();
    return path.join(homeDir, CONFIG_DIR, CONFIG_FILE);
  }

  /**
   * Create a default config file if it doesn't exist
   */
  static createDefaultConfig(): string {
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, CONFIG_DIR);
    const configPath = path.join(configDir, CONFIG_FILE);

    // Create directory if needed
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (!fs.existsSync(configPath)) {
      const defaultConfig = {
        providers: {
          priority: DEFAULT_PROVIDER_PRIORITY,
        },
        roles: {},
      };

      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }

    return configPath;
  }
}
