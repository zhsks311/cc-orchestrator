#!/usr/bin/env node
/**
 * CC Orchestrator Setup Script
 * 통합 설치 스크립트 - API 키 입력, 빌드, hooks/skills/설정 모두 처리
 *
 * Usage:
 *   npm run setup              # 대화형 설치
 *   npm run setup -- --force   # 모든 항목 재설치
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import * as os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isWindows = process.platform === 'win32';
const homeDir = os.homedir();
const claudeDir = path.join(homeDir, '.claude');
const ccoDir = path.join(homeDir, '.cco');
const ccoConfigPath = path.join(ccoDir, 'config.json');
const claudeHooksDir = path.join(claudeDir, 'hooks');
const claudeSkillsDir = path.join(claudeDir, 'skills');
const claudeSettingsPath = path.join(claudeDir, 'settings.json');
const claudeDesktopConfigPath = isWindows
  ? path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json')
  : path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

// Parse args
const args = process.argv.slice(2);
const forceMode = args.includes('--force') || args.includes('-f');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Normalize path to use forward slashes
function normalizePath(p) {
  return p.split(path.sep).join('/');
}

// Read API keys from .env file
function loadEnvFile() {
  const envPath = path.join(rootDir, '.env');
  const keys = {
    OPENAI_API_KEY: '',
    GOOGLE_API_KEY: '',
    ANTHROPIC_API_KEY: ''
  };

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([A-Z_]+)=(.*)$/);
        if (match && keys.hasOwnProperty(match[1])) {
          keys[match[1]] = match[2];
        }
      }
    }
  }

  return keys;
}

// Agent role to provider mapping (matching src/types/model.ts)
const AGENT_PROVIDERS = {
  'oracle': {
    primary: 'openai',
    fallbacks: ['anthropic', 'google'],
    description: '아키텍처 설계, 전략적 의사결정, 코드 리뷰'
  },
  'librarian': {
    primary: 'anthropic',
    fallbacks: ['google', 'openai'],
    description: '문서 검색, 코드베이스 분석'
  },
  'frontend-engineer': {
    primary: 'google',
    fallbacks: ['anthropic', 'openai'],
    description: 'UI/UX 디자인, 프론트엔드 구현'
  },
  'document-writer': {
    primary: 'google',
    fallbacks: ['anthropic', 'openai'],
    description: '기술 문서 작성, README, API 문서'
  },
  'multimodal-analyzer': {
    primary: 'google',
    fallbacks: ['anthropic', 'openai'],
    description: '이미지, PDF 분석'
  },
  'explore': {
    primary: 'anthropic',
    fallbacks: [],
    description: '코드베이스 탐색 (무료, Claude Sonnet)'
  }
};

const PROVIDER_KEYS = {
  'openai': 'OPENAI_API_KEY',
  'anthropic': 'ANTHROPIC_API_KEY',
  'google': 'GOOGLE_API_KEY'
};

// Check which API keys are available
function checkApiKeys(keys) {
  return {
    openai: !!keys.OPENAI_API_KEY,
    anthropic: !!keys.ANTHROPIC_API_KEY,
    google: !!keys.GOOGLE_API_KEY
  };
}

// Get available providers list (ordered by preference)
function getAvailableProviders(keys) {
  const available = checkApiKeys(keys);
  const priority = [];

  // Default priority order: openai > anthropic > google
  if (available.openai) priority.push('openai');
  if (available.anthropic) priority.push('anthropic');
  if (available.google) priority.push('google');

  return priority;
}

// Show agent availability based on API keys
function showAgentAvailability(keys) {
  const available = checkApiKeys(keys);
  const results = [];

  console.log('\n에이전트 가용성:\n');

  for (const [role, config] of Object.entries(AGENT_PROVIDERS)) {
    const primaryAvailable = available[config.primary];
    const fallbackProviders = config.fallbacks.filter(p => available[p]);

    let status, provider;
    if (primaryAvailable) {
      status = '✓';
      provider = config.primary;
    } else if (fallbackProviders.length > 0) {
      status = '⚠';
      provider = fallbackProviders[0];
    } else {
      status = '✗';
      provider = null;
    }

    const providerInfo = provider ? `(${provider})` : '(사용 불가)';
    const statusIcon = status === '✓' ? '✓' : status === '⚠' ? '⚠ fallback' : '✗';

    console.log(`  ${role.padEnd(20)} ${statusIcon.padEnd(12)} ${providerInfo.padEnd(12)} - ${config.description}`);

    results.push({
      role,
      available: status !== '✗',
      useFallback: status === '⚠',
      provider,
      primary: config.primary
    });
  }

  // Summary
  const totalAgents = Object.keys(AGENT_PROVIDERS).length;
  const availableCount = results.filter(r => r.available).length;
  const fallbackCount = results.filter(r => r.useFallback).length;

  console.log('\n  ' + '─'.repeat(56));
  console.log(`  총 ${totalAgents}개 에이전트 중 ${availableCount}개 사용 가능`);
  if (fallbackCount > 0) {
    console.log(`  (${fallbackCount}개 에이전트가 대체 제공자 사용)`);
  }

  return results;
}

// Generate ~/.cco/config.json based on available keys
function generateConfig(keys) {
  const availableProviders = getAvailableProviders(keys);

  if (availableProviders.length === 0) {
    console.log('\n⚠ 사용 가능한 API 키가 없어 설정 파일을 생성할 수 없습니다.');
    return null;
  }

  const config = {
    providers: {
      priority: availableProviders
    },
    roles: {}
  };

  // Set up role-specific provider priority based on original primary
  for (const [role, roleConfig] of Object.entries(AGENT_PROVIDERS)) {
    // Skip explore (always uses anthropic/free)
    if (role === 'explore') continue;

    // Build provider list: primary first if available, then fallbacks
    const available = checkApiKeys(keys);
    const roleProviders = [];

    if (available[roleConfig.primary]) {
      roleProviders.push(roleConfig.primary);
    }

    for (const fallback of roleConfig.fallbacks) {
      if (available[fallback] && !roleProviders.includes(fallback)) {
        roleProviders.push(fallback);
      }
    }

    if (roleProviders.length > 0 &&
        (roleProviders[0] !== availableProviders[0] || roleProviders.length !== availableProviders.length)) {
      config.roles[role] = { providers: roleProviders };
    }
  }

  return config;
}

// Save config file
function saveConfig(config) {
  if (!config) return false;

  try {
    if (!fs.existsSync(ccoDir)) {
      fs.mkdirSync(ccoDir, { recursive: true });
    }

    fs.writeFileSync(ccoConfigPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('설정 파일 저장 실패:', error.message);
    return false;
  }
}

function copyDirRecursive(src, dest, exclude = []) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.some(ex => entry.name === ex || entry.name.startsWith(ex))) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath, exclude);
    else fs.copyFileSync(srcPath, destPath);
  }
}

// Check installation status
function checkStatus() {
  const status = {
    env: fs.existsSync(path.join(rootDir, '.env')),
    nodeModules: fs.existsSync(path.join(rootDir, 'node_modules')),
    dist: fs.existsSync(path.join(rootDir, 'dist', 'index.js')),
    hooks: fs.existsSync(path.join(claudeHooksDir, 'review_orchestrator.py')),
    skills: fs.existsSync(path.join(claudeSkillsDir, 'orchestrate', 'SKILL.md')),
    desktopConfig: false,
    ccoConfig: fs.existsSync(ccoConfigPath)
  };

  // Check desktop config
  if (fs.existsSync(claudeDesktopConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(claudeDesktopConfigPath, 'utf8'));
      status.desktopConfig = !!(cfg.mcpServers && cfg.mcpServers['cc-orchestrator']);
    } catch (e) { }
  }

  return status;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       CC Orchestrator - Setup Wizard                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Check current status
  const status = checkStatus();
  const allInstalled = status.env && status.nodeModules && status.dist &&
                       status.hooks && status.skills && status.desktopConfig &&
                       status.ccoConfig;

  console.log('현재 설치 상태:');
  console.log(`  .env 파일:        ${status.env ? '✓' : '✗'}`);
  console.log(`  node_modules:     ${status.nodeModules ? '✓' : '✗'}`);
  console.log(`  빌드 (dist):      ${status.dist ? '✓' : '✗'}`);
  console.log(`  Hooks:            ${status.hooks ? '✓' : '✗'}`);
  console.log(`  Skills:           ${status.skills ? '✓' : '✗'}`);
  console.log(`  Desktop Config:   ${status.desktopConfig ? '✓' : '✗'}`);
  console.log(`  CCO Config:       ${status.ccoConfig ? '✓' : '✗'}`);
  console.log('');

  if (allInstalled && !forceMode) {
    console.log('✅ 모든 항목이 이미 설치되어 있습니다.');
    console.log('   재설치하려면: npm run setup -- --force\n');
    rl.close();
    return;
  }

  // API Keys
  let openaiKey = '', googleKey = '', anthropicKey = '';

  if (!status.env || forceMode) {
    console.log('─'.repeat(60));
    console.log('\nAPI 키 설정 (Enter로 건너뛰기 가능)\n');

    // Load existing keys if available
    const existingKeys = loadEnvFile();

    openaiKey = await question(`OpenAI API Key${existingKeys.OPENAI_API_KEY ? ' [기존 유지]' : ''}: `);
    googleKey = await question(`Google API Key${existingKeys.GOOGLE_API_KEY ? ' [기존 유지]' : ''}: `);
    anthropicKey = await question(`Anthropic API Key${existingKeys.ANTHROPIC_API_KEY ? ' [기존 유지]' : ''}: `);

    // Use existing keys if not provided
    if (!openaiKey && existingKeys.OPENAI_API_KEY) openaiKey = existingKeys.OPENAI_API_KEY;
    if (!googleKey && existingKeys.GOOGLE_API_KEY) googleKey = existingKeys.GOOGLE_API_KEY;
    if (!anthropicKey && existingKeys.ANTHROPIC_API_KEY) anthropicKey = existingKeys.ANTHROPIC_API_KEY;

    console.log('\n입력된 API 키:');
    console.log(`  OpenAI:    ${openaiKey ? '✓ 설정됨' : '✗ 없음'}`);
    console.log(`  Google:    ${googleKey ? '✓ 설정됨' : '✗ 없음'}`);
    console.log(`  Anthropic: ${anthropicKey ? '✓ 설정됨' : '✗ 없음'}`);
  } else {
    const existingKeys = loadEnvFile();
    openaiKey = existingKeys.OPENAI_API_KEY;
    googleKey = existingKeys.GOOGLE_API_KEY;
    anthropicKey = existingKeys.ANTHROPIC_API_KEY;
    console.log('API 키: 기존 .env 파일 사용');
  }

  // Show agent availability based on current keys
  const currentKeys = {
    OPENAI_API_KEY: openaiKey,
    GOOGLE_API_KEY: googleKey,
    ANTHROPIC_API_KEY: anthropicKey
  };
  showAgentAvailability(currentKeys);

  const confirm = await question('\n설치를 진행하시겠습니까? (Y/n): ');
  if (confirm.toLowerCase() === 'n') {
    console.log('\n설치가 취소되었습니다.\n');
    rl.close();
    return;
  }

  console.log('\n' + '═'.repeat(60));
  console.log('설치 시작...\n');

  // 1. Create .env
  if (!status.env || forceMode) {
    console.log('[1/7] .env 파일 생성...');
    const envContent = `# CC Orchestrator API Keys
OPENAI_API_KEY=${openaiKey}
GOOGLE_API_KEY=${googleKey}
ANTHROPIC_API_KEY=${anthropicKey}

# Server Configuration
LOG_LEVEL=info
NODE_ENV=production
`;
    fs.writeFileSync(path.join(rootDir, '.env'), envContent);
    console.log('      ✓ 완료');
  } else {
    console.log('[1/7] .env 파일: 이미 존재 (건너뜀)');
  }

  // 2. npm install
  if (!status.nodeModules || forceMode) {
    console.log('[2/7] 의존성 설치 (npm install)...');
    try {
      execSync('npm install', { cwd: rootDir, stdio: 'inherit' });
      console.log('      ✓ 완료');
    } catch (error) {
      console.error('      ✗ 실패');
      rl.close();
      process.exit(1);
    }
  } else {
    console.log('[2/7] node_modules: 이미 존재 (건너뜀)');
  }

  // 3. Build
  if (!status.dist || forceMode) {
    console.log('[3/7] 빌드 (npm run build)...');
    try {
      execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
      console.log('      ✓ 완료');
    } catch (error) {
      console.error('      ✗ 실패');
      rl.close();
      process.exit(1);
    }
  } else {
    console.log('[3/7] 빌드: 이미 완료 (건너뜀)');
  }

  // 4. Install Hooks
  if (!status.hooks || forceMode) {
    console.log('[4/7] Hooks 설치...');
    const srcHooksDir = path.join(rootDir, 'hooks');
    if (fs.existsSync(srcHooksDir)) {
      copyDirRecursive(srcHooksDir, claudeHooksDir, ['__pycache__', 'api_keys.json', 'logs', 'state', '.example']);

      // Set up api_keys.json
      const apiKeysPath = path.join(claudeHooksDir, 'api_keys.json');
      let hooksApiKeys = { GEMINI_API_KEY: googleKey || '' };
      if (fs.existsSync(apiKeysPath) && !googleKey) {
        try {
          const existing = JSON.parse(fs.readFileSync(apiKeysPath, 'utf8'));
          if (existing.GEMINI_API_KEY) hooksApiKeys.GEMINI_API_KEY = existing.GEMINI_API_KEY;
        } catch (e) { }
      }
      fs.writeFileSync(apiKeysPath, JSON.stringify(hooksApiKeys, null, 2));
      fs.mkdirSync(path.join(claudeHooksDir, 'logs'), { recursive: true });
      fs.mkdirSync(path.join(claudeHooksDir, 'state'), { recursive: true });
      console.log('      ✓ 완료: ' + claudeHooksDir);
    }
  } else {
    console.log('[4/7] Hooks: 이미 설치됨 (건너뜀)');
  }

  // 5. Install Skills
  if (!status.skills || forceMode) {
    console.log('[5/7] Skills 설치...');
    const srcSkillsDir = path.join(rootDir, 'skills');
    if (fs.existsSync(srcSkillsDir)) {
      copyDirRecursive(srcSkillsDir, claudeSkillsDir);
      console.log('      ✓ 완료: ' + claudeSkillsDir);
    }
  } else {
    console.log('[5/7] Skills: 이미 설치됨 (건너뜀)');
  }

  // 6. Update settings.json and desktop config
  console.log('[6/7] Claude 설정 업데이트...');

  // Update settings.json
  const templatePath = path.join(rootDir, 'templates', 'settings.template.json');
  if (fs.existsSync(templatePath)) {
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    let existing = {};
    if (fs.existsSync(claudeSettingsPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
        fs.copyFileSync(claudeSettingsPath, claudeSettingsPath + '.backup');
      } catch (e) { }
    }

    // Merge settings
    const hooksPath = normalizePath(claudeHooksDir);
    const templateStr = JSON.stringify(template).split('{{HOOKS_PATH}}').join(hooksPath);
    const resolved = JSON.parse(templateStr);
    const merged = { ...existing };
    if (resolved.hooks) {
      merged.hooks = merged.hooks || {};
      for (const [event, hooks] of Object.entries(resolved.hooks)) {
        merged.hooks[event] = merged.hooks[event] || [];
        for (const newHook of hooks) {
          if (!merged.hooks[event].some(h => JSON.stringify(h.hooks) === JSON.stringify(newHook.hooks))) {
            merged.hooks[event].push(newHook);
          }
        }
      }
    }
    if (resolved.alwaysThinkingEnabled !== undefined) {
      merged.alwaysThinkingEnabled = resolved.alwaysThinkingEnabled;
    }
    fs.writeFileSync(claudeSettingsPath, JSON.stringify(merged, null, 2));
    console.log('      ✓ settings.json 업데이트');
  }

  // Update desktop config
  try {
    let cfg = { mcpServers: {} };
    if (fs.existsSync(claudeDesktopConfigPath)) {
      cfg = JSON.parse(fs.readFileSync(claudeDesktopConfigPath, 'utf8'));
      fs.copyFileSync(claudeDesktopConfigPath, claudeDesktopConfigPath + '.backup');
    }
    cfg.mcpServers = cfg.mcpServers || {};

    const indexPath = normalizePath(path.join(rootDir, 'dist', 'index.js'));

    // Remove duplicates
    for (const [key, value] of Object.entries(cfg.mcpServers)) {
      if (key !== 'cc-orchestrator' && value.args && value.args[0]) {
        if (normalizePath(value.args[0]) === indexPath) {
          delete cfg.mcpServers[key];
        }
      }
    }

    cfg.mcpServers['cc-orchestrator'] = {
      command: 'node',
      args: [indexPath],
      env: {
        OPENAI_API_KEY: openaiKey,
        GOOGLE_API_KEY: googleKey,
        ANTHROPIC_API_KEY: anthropicKey
      }
    };

    fs.mkdirSync(path.dirname(claudeDesktopConfigPath), { recursive: true });
    fs.writeFileSync(claudeDesktopConfigPath, JSON.stringify(cfg, null, 2));
    console.log('      ✓ claude_desktop_config.json 업데이트');
  } catch (e) {
    console.log('      ⚠ desktop config 업데이트 실패: ' + e.message);
  }

  // 7. Generate CCO config file
  console.log('[7/7] CCO 설정 파일 생성...');
  const ccoConfig = generateConfig(currentKeys);
  if (ccoConfig && saveConfig(ccoConfig)) {
    console.log('      ✓ 완료: ' + ccoConfigPath);
    console.log('      Provider 우선순위: ' + ccoConfig.providers.priority.join(' > '));
    if (Object.keys(ccoConfig.roles).length > 0) {
      console.log('      Role별 설정: ' + Object.keys(ccoConfig.roles).join(', '));
    }
  } else if (!ccoConfig) {
    console.log('      ⚠ API 키가 없어 설정 파일을 생성하지 않음');
  }

  // Done
  console.log('\n' + '═'.repeat(60));
  console.log('\n✅ CC Orchestrator 설치가 완료되었습니다!');
  console.log('\n⚠️  Claude Code를 재시작하세요.\n');

  rl.close();
}

main().catch((error) => {
  console.error('오류 발생:', error);
  rl.close();
  process.exit(1);
});
