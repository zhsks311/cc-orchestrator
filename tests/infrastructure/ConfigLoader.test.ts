import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigLoader } from '../../src/infrastructure/ConfigLoader.js';
import { AgentRuntimeKind, CapabilityKey } from '../../src/types/index.js';

const tempPaths: string[] = [];

function createConfigFile(content: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-config-'));
  const filePath = path.join(dir, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  tempPaths.push(dir);
  return filePath;
}

describe('ConfigLoader', () => {
  afterEach(() => {
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
        primaryAdapter: 'claude-code',
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

  it('should create an adapter-centric default config file', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-home-'));
    tempPaths.push(homeDir);
    vi.stubEnv('HOME', homeDir);

    const configPath = ConfigLoader.createDefaultConfig();
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(content.defaults.primaryAdapter).toBe('codex');
    expect(content.adapters.codex.runtime).toBe('codex');
    expect(content.debate.autoValidate).toBe(true);
  });
});
