import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigLoader } from '../../src/infrastructure/ConfigLoader.js';
import { AgentRuntimeKind, CapabilityKey } from '../../src/types/index.js';
import { ConfigurationError } from '../../src/types/errors.js';

const tempPaths: string[] = [];

function createConfigFile(content: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-config-'));
  const filePath = path.join(dir, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  tempPaths.push(dir);
  return filePath;
}

function createRawConfigFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-config-'));
  const filePath = path.join(dir, 'config.json');
  fs.writeFileSync(filePath, content);
  tempPaths.push(dir);
  return filePath;
}

describe('ConfigLoader', () => {
  afterEach(() => {
    for (const tempPath of tempPaths.splice(0)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  it('should load adapter-centric config from file', () => {
    const configPath = createConfigFile({
      defaults: {
        primaryAdapter: 'codex',
        fallbackAdapter: 'claude-code',
      },
      debate: {
        autoValidate: true,
        defaultStances: ['skeptic', 'reviewer'],
      },
      adapters: {
        codex: {
          runtime: 'codex',
          enabled: true,
          command: 'codex',
          capabilities: ['planning', 'implementation'],
        },
        claude_code: {
          runtime: 'claude-code',
          enabled: true,
          command: 'claude',
          capabilities: ['planning', 'debate_participation'],
        },
      },
    });

    vi.stubEnv('CCO_CONFIG_PATH', configPath);

    const loader = new ConfigLoader();
    const config = loader.getConfig();

    expect(config.defaults.primaryAdapter).toBe('codex');
    expect(config.adapters.codex?.runtime).toBe(AgentRuntimeKind.CODEX);
    expect(config.adapters.claude_code?.capabilities).toContain(CapabilityKey.DEBATE_PARTICIPATION);
    expect(config.debate.defaultStances).toEqual(['skeptic', 'reviewer']);
  });

  it('should return adapter descriptors in priority order', () => {
    const configPath = createConfigFile({
      defaults: {
        primaryAdapter: 'claude_code',
        fallbackAdapter: 'codex',
      },
      adapters: {
        claude_code: {
          runtime: 'claude-code',
          enabled: true,
          command: 'claude',
          capabilities: ['planning'],
        },
        codex: {
          runtime: 'codex',
          enabled: true,
          command: 'codex',
          capabilities: ['implementation'],
        },
      },
    });

    vi.stubEnv('CCO_CONFIG_PATH', configPath);

    const loader = new ConfigLoader();
    const adapters = loader.getAdapterConfigs();

    expect(adapters.map((adapter) => adapter.id)).toEqual(['claude-code', 'codex']);
  });

  it('should preserve file primary adapter when only fallback adapter is overridden by env', () => {
    const configPath = createConfigFile({
      defaults: {
        primaryAdapter: 'claude-code',
        fallbackAdapter: 'gemini-cli',
      },
    });

    vi.stubEnv('CCO_CONFIG_PATH', configPath);
    vi.stubEnv('CCO_FALLBACK_ADAPTER', 'codex');

    const loader = new ConfigLoader();
    const config = loader.getConfig();

    expect(config.defaults.primaryAdapter).toBe('claude-code');
    expect(config.defaults.fallbackAdapter).toBe('codex');
  });

  it('should deep-merge adapter overrides and canonicalize adapter keys', () => {
    const configPath = createConfigFile({
      adapters: {
        codex: {
          command: 'codex-custom',
        },
        'claude-code': {
          command: 'claude-custom',
        },
      },
    });

    vi.stubEnv('CCO_CONFIG_PATH', configPath);

    const loader = new ConfigLoader();
    const config = loader.getConfig();

    expect(config.adapters.codex.command).toBe('codex-custom');
    expect(config.adapters.codex.capabilities).toContain(CapabilityKey.PLANNING);
    expect(config.adapters.claude_code.command).toBe('claude-custom');
    expect(config.adapters.claude_code.capabilities).toContain(CapabilityKey.DEBATE_PARTICIPATION);
    expect(Object.keys(config.adapters)).not.toContain('claude-code');
  });

  it('should throw when adapter runtime is invalid', () => {
    const configPath = createConfigFile({
      adapters: {
        codex: {
          runtime: 'not-a-runtime',
          capabilities: ['planning'],
        },
      },
    });

    vi.stubEnv('CCO_CONFIG_PATH', configPath);

    expect(() => new ConfigLoader()).toThrow(ConfigurationError);
  });

  it('should throw when adapter capabilities contain invalid values', () => {
    const configPath = createConfigFile({
      adapters: {
        codex: {
          runtime: 'codex',
          capabilities: ['planning', 'not-a-capability'],
        },
      },
    });

    vi.stubEnv('CCO_CONFIG_PATH', configPath);

    expect(() => new ConfigLoader()).toThrow(ConfigurationError);
  });

  it('should throw when debate stances contain invalid values', () => {
    const configPath = createConfigFile({
      debate: {
        defaultStances: ['skeptic', 'not-a-stance'],
      },
    });

    vi.stubEnv('CCO_CONFIG_PATH', configPath);

    expect(() => new ConfigLoader()).toThrow(ConfigurationError);
  });

  it('should throw when config file contains malformed JSON', () => {
    const configPath = createRawConfigFile('{ invalid json');

    vi.stubEnv('CCO_CONFIG_PATH', configPath);

    expect(() => new ConfigLoader()).toThrow(ConfigurationError);
  });

  it('should create an adapter-centric default config file', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-home-'));
    tempPaths.push(homeDir);
    vi.stubEnv('CCO_CONFIG_PATH', '');
    vi.stubEnv('HOME', homeDir);
    vi.stubEnv('USERPROFILE', homeDir);

    const configPath = ConfigLoader.createDefaultConfig();
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(content.defaults.primaryAdapter).toBe('codex');
    expect(content.adapters.codex.runtime).toBe('codex');
    expect(content.debate.autoValidate).toBe(true);
  });
});
