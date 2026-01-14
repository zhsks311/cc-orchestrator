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

// Manifest file paths for version tracking
const hooksManifestPath = path.join(claudeHooksDir, '.cco-manifest.json');
const skillsManifestPath = path.join(claudeSkillsDir, '.cco-manifest.json');

// Get current version from package.json
const packageJsonPath = path.join(rootDir, 'package.json');
const CURRENT_VERSION = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;

// Parse args
const args = process.argv.slice(2);
const forceMode = args.includes('--force') || args.includes('-f');
const yesMode = args.includes('--yes') || args.includes('-y');

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

// Read API keys from Claude Desktop config
function loadExistingKeys() {
  const keys = {
    OPENAI_API_KEY: '',
    GOOGLE_API_KEY: '',
    ANTHROPIC_API_KEY: ''
  };

  if (fs.existsSync(claudeDesktopConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(claudeDesktopConfigPath, 'utf8'));
      const mcpEnv = cfg.mcpServers?.['cc-orchestrator']?.env;
      if (mcpEnv) {
        if (mcpEnv.OPENAI_API_KEY) keys.OPENAI_API_KEY = mcpEnv.OPENAI_API_KEY;
        if (mcpEnv.GOOGLE_API_KEY) keys.GOOGLE_API_KEY = mcpEnv.GOOGLE_API_KEY;
        if (mcpEnv.ANTHROPIC_API_KEY) keys.ANTHROPIC_API_KEY = mcpEnv.ANTHROPIC_API_KEY;
      }
    } catch (e) { }
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
    fallbacks: ['google', 'openai'],
    description: '코드베이스 탐색 (Claude Sonnet)'
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

    let status, provider, delegated = false;
    if (primaryAvailable) {
      status = '✓';
      provider = config.primary;
    } else if (fallbackProviders.length > 0) {
      status = '⚠';
      provider = fallbackProviders[0];
    } else {
      // API 키 없으면 Claude Code 위임 (항상 사용 가능)
      status = '✓';
      provider = null;
      delegated = true;
    }

    const providerInfo = delegated ? '(Claude Code 위임)' : `(${provider})`;
    const statusIcon = status === '✓' ? '✓' : '⚠ fallback';

    console.log(`  ${role.padEnd(20)} ${statusIcon.padEnd(12)} ${providerInfo.padEnd(18)} - ${config.description}`);

    results.push({
      role,
      available: true,  // 항상 사용 가능 (delegation 지원)
      useFallback: status === '⚠',
      delegated,
      provider,
      primary: config.primary
    });
  }

  // Summary
  const totalAgents = Object.keys(AGENT_PROVIDERS).length;
  const delegatedCount = results.filter(r => r.delegated).length;
  const fallbackCount = results.filter(r => r.useFallback).length;

  console.log('\n  ' + '─'.repeat(62));
  console.log(`  총 ${totalAgents}개 에이전트 모두 사용 가능`);
  if (delegatedCount > 0) {
    console.log(`  (${delegatedCount}개 에이전트가 Claude Code 위임 모드)`);
  }
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
  const copiedFiles = [];
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.some(ex => entry.name === ex || entry.name.startsWith(ex))) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      const subFiles = copyDirRecursive(srcPath, destPath, exclude);
      copiedFiles.push(...subFiles.map(f => path.join(entry.name, f)));
    } else {
      fs.copyFileSync(srcPath, destPath);
      copiedFiles.push(entry.name);
    }
  }
  return copiedFiles;
}

// ============================================================
// Manifest functions for version tracking
// ============================================================

function createManifest(files) {
  return {
    name: 'cc-orchestrator',
    version: CURRENT_VERSION,
    installedAt: new Date().toISOString(),
    files: files
  };
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function isOurInstallation(manifestPath) {
  const manifest = readManifest(manifestPath);
  return manifest?.name === 'cc-orchestrator';
}

function needsUpdate(manifestPath) {
  const manifest = readManifest(manifestPath);
  if (!manifest) return true;
  return manifest.version !== CURRENT_VERSION;
}

function writeManifest(manifestPath, files) {
  const manifest = createManifest(files);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

// ============================================================
// Installation mode detection
// ============================================================

function detectInstallMode() {
  const hooksManifest = readManifest(hooksManifestPath);
  const skillsManifest = readManifest(skillsManifestPath);

  const hooksExist = fs.existsSync(claudeHooksDir) &&
    fs.readdirSync(claudeHooksDir).some(f => f.endsWith('.py'));
  const skillsExist = fs.existsSync(claudeSkillsDir) &&
    fs.readdirSync(claudeSkillsDir).length > 0;

  // 1. cc-orchestrator가 설치되어 있고 버전이 다름 → upgrade
  if (hooksManifest?.name === 'cc-orchestrator' && hooksManifest.version !== CURRENT_VERSION) {
    return {
      mode: 'upgrade',
      fromVersion: hooksManifest.version,
      toVersion: CURRENT_VERSION
    };
  }

  // 2. cc-orchestrator가 설치되어 있고 버전이 같음 → current
  if (hooksManifest?.name === 'cc-orchestrator' && hooksManifest.version === CURRENT_VERSION) {
    return {
      mode: 'current',
      version: CURRENT_VERSION
    };
  }

  // 3. 다른 프로젝트 파일이 있음 (manifest 없음) → conflict
  if ((hooksExist && !hooksManifest) || (skillsExist && !skillsManifest)) {
    return {
      mode: 'conflict',
      hasHooks: hooksExist && !hooksManifest,
      hasSkills: skillsExist && !skillsManifest
    };
  }

  // 4. 완전히 새로운 설치 → fresh
  return { mode: 'fresh' };
}

// ============================================================
// Installation verification
// ============================================================

function verifyInstallation() {
  const results = {
    mcp: { ok: false, message: '' },
    hooks: { ok: false, message: '', count: 0 },
    skills: { ok: false, message: '', count: 0 },
    config: { ok: false, message: '' }
  };

  // MCP 서버
  const distPath = path.join(rootDir, 'dist', 'index.js');
  if (fs.existsSync(distPath)) {
    results.mcp = { ok: true, message: normalizePath(distPath) };
  } else {
    results.mcp = { ok: false, message: 'dist/index.js 없음' };
  }

  // Hooks
  const hooksManifest = readManifest(hooksManifestPath);
  if (hooksManifest?.name === 'cc-orchestrator') {
    const missing = hooksManifest.files.filter(f =>
      !fs.existsSync(path.join(claudeHooksDir, f))
    );
    if (missing.length === 0) {
      results.hooks = {
        ok: true,
        message: `v${hooksManifest.version}`,
        count: hooksManifest.files.length
      };
    } else {
      results.hooks = {
        ok: false,
        message: `누락: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`,
        count: hooksManifest.files.length - missing.length
      };
    }
  } else {
    results.hooks = { ok: false, message: '미설치 또는 다른 프로젝트', count: 0 };
  }

  // Skills
  const skillsManifest = readManifest(skillsManifestPath);
  if (skillsManifest?.name === 'cc-orchestrator') {
    const missing = skillsManifest.files.filter(f =>
      !fs.existsSync(path.join(claudeSkillsDir, f))
    );
    if (missing.length === 0) {
      results.skills = {
        ok: true,
        message: `v${skillsManifest.version}`,
        count: skillsManifest.files.length
      };
    } else {
      results.skills = {
        ok: false,
        message: `누락: ${missing.join(', ')}`,
        count: skillsManifest.files.length - missing.length
      };
    }
  } else {
    results.skills = { ok: false, message: '미설치 또는 다른 프로젝트', count: 0 };
  }

  // Desktop config
  if (fs.existsSync(claudeDesktopConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(claudeDesktopConfigPath, 'utf8'));
      if (cfg.mcpServers?.['cc-orchestrator']) {
        results.config = { ok: true, message: '등록됨' };
      } else {
        results.config = { ok: false, message: 'MCP 서버 미등록' };
      }
    } catch {
      results.config = { ok: false, message: '설정 파일 읽기 실패' };
    }
  } else {
    results.config = { ok: false, message: '설정 파일 없음' };
  }

  return results;
}

function printVerificationResults(results) {
  console.log('\n[검증] 설치 상태 확인 중...');

  const icon = (ok) => ok ? '✓' : '✗';

  console.log(`      MCP 서버:     ${icon(results.mcp.ok)} ${results.mcp.message}`);
  console.log(`      Hooks:        ${icon(results.hooks.ok)} ${results.hooks.message}${results.hooks.count ? ` (${results.hooks.count}개 파일)` : ''}`);
  console.log(`      Skills:       ${icon(results.skills.ok)} ${results.skills.message}${results.skills.count ? ` (${results.skills.count}개 파일)` : ''}`);
  console.log(`      Desktop 설정: ${icon(results.config.ok)} ${results.config.message}`);

  const allOk = results.mcp.ok && results.hooks.ok && results.skills.ok && results.config.ok;

  if (allOk) {
    console.log('\n✅ 모든 컴포넌트 정상 설치됨!');
  } else {
    console.log('\n⚠️  일부 컴포넌트에 문제가 있습니다.');
    console.log('   해결: npx cc-orch --force');
  }

  return allOk;
}

// Check installation status (manifest-based + file verification)
function checkStatus() {
  const hooksManifest = readManifest(hooksManifestPath);
  const skillsManifest = readManifest(skillsManifestPath);

  const status = {
    nodeModules: fs.existsSync(path.join(rootDir, 'node_modules')),
    dist: fs.existsSync(path.join(rootDir, 'dist', 'index.js')),
    hooks: {
      installed: hooksManifest?.name === 'cc-orchestrator',
      version: hooksManifest?.version || null,
      needsUpdate: needsUpdate(hooksManifestPath),
      corrupted: false
    },
    skills: {
      installed: skillsManifest?.name === 'cc-orchestrator',
      version: skillsManifest?.version || null,
      needsUpdate: needsUpdate(skillsManifestPath),
      corrupted: false
    },
    desktopConfig: false,
    ccoConfig: fs.existsSync(ccoConfigPath)
  };

  // Verify actual hook files exist (not just manifest)
  if (hooksManifest?.name === 'cc-orchestrator' && hooksManifest.files) {
    const missing = hooksManifest.files.filter(f =>
      !fs.existsSync(path.join(claudeHooksDir, f))
    );
    if (missing.length > 0) {
      status.hooks.installed = false;
      status.hooks.corrupted = true;
    }
  }

  // Verify actual skill files exist (not just manifest)
  if (skillsManifest?.name === 'cc-orchestrator' && skillsManifest.files) {
    const missing = skillsManifest.files.filter(f =>
      !fs.existsSync(path.join(claudeSkillsDir, f))
    );
    if (missing.length > 0) {
      status.skills.installed = false;
      status.skills.corrupted = true;
    }
  }

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
  console.log(`║       Version: ${CURRENT_VERSION.padEnd(43)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Detect installation mode
  const installMode = detectInstallMode();
  const status = checkStatus();

  // Display status based on mode
  console.log('현재 설치 상태:');
  console.log(`  node_modules:     ${status.nodeModules ? '✓' : '✗'}`);
  console.log(`  빌드 (dist):      ${status.dist ? '✓' : '✗'}`);

  // Hooks status with version info
  if (status.hooks.corrupted) {
    console.log(`  Hooks:            ✗ 파일 손상 (재설치 필요)`);
  } else if (status.hooks.installed) {
    const hooksStatus = status.hooks.needsUpdate
      ? `✓ v${status.hooks.version} → v${CURRENT_VERSION} 업데이트 가능`
      : `✓ v${status.hooks.version} (최신)`;
    console.log(`  Hooks:            ${hooksStatus}`);
  } else {
    console.log(`  Hooks:            ✗ 미설치`);
  }

  // Skills status with version info
  if (status.skills.corrupted) {
    console.log(`  Skills:           ✗ 파일 손상 (재설치 필요)`);
  } else if (status.skills.installed) {
    const skillsStatus = status.skills.needsUpdate
      ? `✓ v${status.skills.version} → v${CURRENT_VERSION} 업데이트 가능`
      : `✓ v${status.skills.version} (최신)`;
    console.log(`  Skills:           ${skillsStatus}`);
  } else {
    console.log(`  Skills:           ✗ 미설치`);
  }

  console.log(`  Desktop Config:   ${status.desktopConfig ? '✓' : '✗'}`);
  console.log(`  CCO Config:       ${status.ccoConfig ? '✓' : '✗'}`);
  console.log('');

  // Handle different installation modes
  let shouldProceed = true;

  // Skip if already up-to-date and no corruption
  const hasCorruption = status.hooks.corrupted || status.skills.corrupted;
  if (installMode.mode === 'current' && !forceMode && !hasCorruption) {
    console.log(`✅ CC Orchestrator v${CURRENT_VERSION} 이미 최신 버전입니다.`);
    console.log('   재설치하려면: npm run setup -- --force\n');
    rl.close();
    return;
  }

  if (installMode.mode === 'upgrade') {
    console.log(`📦 업그레이드 감지: v${installMode.fromVersion} → v${installMode.toVersion}`);
  }

  if (installMode.mode === 'conflict') {
    console.log('⚠️  ~/.claude/ 에 다른 프로젝트 파일이 발견되었습니다.');
    if (installMode.hasHooks) console.log('   - hooks/ 폴더에 cc-orchestrator가 아닌 파일 존재');
    if (installMode.hasSkills) console.log('   - skills/ 폴더에 cc-orchestrator가 아닌 파일 존재');
    console.log('');

    if (yesMode) {
      console.log('--yes 모드: 병합으로 진행합니다.\n');
    } else {
      const conflictChoice = await question('어떻게 진행할까요?\n  1) 병합 (cc-orchestrator 파일만 추가)\n  2) 취소\n\n선택 (1/2): ');

      if (conflictChoice !== '1') {
        console.log('\n설치가 취소되었습니다.\n');
        rl.close();
        return;
      }
      console.log('');
    }
  }

  if (installMode.mode === 'fresh') {
    console.log('🆕 신규 설치를 진행합니다.');
  }

  // Check if all components need installation
  const allInstalled = status.nodeModules && status.dist &&
                       status.hooks.installed && !status.hooks.needsUpdate &&
                       status.skills.installed && !status.skills.needsUpdate &&
                       status.desktopConfig && status.ccoConfig;

  if (allInstalled && !forceMode) {
    console.log('✅ 모든 항목이 이미 설치되어 있습니다.');
    console.log('   재설치하려면: npm run setup -- --force\n');
    rl.close();
    return;
  }

  // API Keys - load from existing desktop config
  const existingKeys = loadExistingKeys();
  let openaiKey = existingKeys.OPENAI_API_KEY;
  let googleKey = existingKeys.GOOGLE_API_KEY;
  let anthropicKey = existingKeys.ANTHROPIC_API_KEY;

  if (!yesMode && (!status.desktopConfig || forceMode)) {
    console.log('─'.repeat(60));
    console.log('\nAPI 키 설정 (Enter로 건너뛰기 가능)\n');

    const inputOpenai = await question(`OpenAI API Key${openaiKey ? ' [기존 유지]' : ''}: `);
    const inputGoogle = await question(`Google API Key${googleKey ? ' [기존 유지]' : ''}: `);
    const inputAnthropic = await question(`Anthropic API Key${anthropicKey ? ' [기존 유지]' : ''}: `);

    // Use new keys if provided, otherwise keep existing
    if (inputOpenai) openaiKey = inputOpenai;
    if (inputGoogle) googleKey = inputGoogle;
    if (inputAnthropic) anthropicKey = inputAnthropic;

    console.log('\n입력된 API 키:');
    console.log(`  OpenAI:    ${openaiKey ? '✓ 설정됨' : '✗ 없음'}`);
    console.log(`  Google:    ${googleKey ? '✓ 설정됨' : '✗ 없음'}`);
    console.log(`  Anthropic: ${anthropicKey ? '✓ 설정됨' : '✗ 없음'}`);
  } else {
    console.log('API 키: 기존 설정 사용');
  }

  // Show agent availability based on current keys
  const currentKeys = {
    OPENAI_API_KEY: openaiKey,
    GOOGLE_API_KEY: googleKey,
    ANTHROPIC_API_KEY: anthropicKey
  };
  showAgentAvailability(currentKeys);

  if (!yesMode) {
    const confirm = await question('\n설치를 진행하시겠습니까? (Y/n): ');
    if (confirm.toLowerCase() === 'n') {
      console.log('\n설치가 취소되었습니다.\n');
      rl.close();
      return;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('설치 시작...\n');

  // 1. npm install
  if (!status.nodeModules || forceMode) {
    console.log('[1/7] 의존성 설치 (npm install)...');
    try {
      execSync('npm install', { cwd: rootDir, stdio: 'inherit' });
      console.log('      ✓ 완료');
    } catch (error) {
      console.error('      ✗ 실패');
      rl.close();
      process.exit(1);
    }
  } else {
    console.log('[1/7] node_modules: 이미 존재 (건너뜀)');
  }

  // 2. Build
  if (!status.dist || forceMode) {
    console.log('[2/7] 빌드 (npm run build)...');
    try {
      execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
      console.log('      ✓ 완료');
    } catch (error) {
      console.error('      ✗ 실패');
      rl.close();
      process.exit(1);
    }
  } else {
    console.log('[2/7] 빌드: 이미 완료 (건너뜀)');
  }

  // 3. Install Hooks
  const shouldInstallHooks = !status.hooks.installed || status.hooks.needsUpdate || forceMode;
  if (shouldInstallHooks) {
    console.log('[3/7] Hooks 설치...');
    const srcHooksDir = path.join(rootDir, 'hooks');
    if (fs.existsSync(srcHooksDir)) {
      const copiedFiles = copyDirRecursive(srcHooksDir, claudeHooksDir, ['__pycache__', 'api_keys.json', 'logs', 'state', '.example', '.cco-manifest.json']);

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

      // Write manifest
      writeManifest(hooksManifestPath, copiedFiles);
      console.log(`      ✓ 완료: ${claudeHooksDir} (${copiedFiles.length}개 파일)`);
    }
  } else {
    console.log(`[3/7] Hooks: v${status.hooks.version} 최신 (건너뜀)`);
  }

  // 4. Install Skills
  const shouldInstallSkills = !status.skills.installed || status.skills.needsUpdate || forceMode;
  if (shouldInstallSkills) {
    console.log('[4/7] Skills 설치...');
    const srcSkillsDir = path.join(rootDir, 'skills');
    if (fs.existsSync(srcSkillsDir)) {
      const copiedFiles = copyDirRecursive(srcSkillsDir, claudeSkillsDir, ['.cco-manifest.json']);

      // Write manifest
      writeManifest(skillsManifestPath, copiedFiles);
      console.log(`      ✓ 완료: ${claudeSkillsDir} (${copiedFiles.length}개 파일)`);
    }
  } else {
    console.log(`[4/7] Skills: v${status.skills.version} 최신 (건너뜀)`);
  }

  // 5. Update settings.json and desktop config
  console.log('[5/7] Claude 설정 업데이트...');

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

  // 6. Generate CCO config file
  console.log('[6/7] CCO 설정 파일 생성...');
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

  // 7. Verify installation
  console.log('[7/7] 설치 검증...');
  const verifyResults = verifyInstallation();
  const allOk = printVerificationResults(verifyResults);

  // Done
  console.log('\n' + '═'.repeat(60));

  if (allOk) {
    console.log('\n✅ CC Orchestrator v' + CURRENT_VERSION + ' 설치가 완료되었습니다!');
  } else {
    console.log('\n⚠️  CC Orchestrator 설치가 완료되었지만 일부 문제가 있습니다.');
  }

  console.log('\n다음 단계:');
  console.log('  1. Claude Code를 재시작하세요');
  console.log('  2. "oracle한테 이 프로젝트 리뷰해달라고 해" 로 테스트\n');

  rl.close();
}

main().catch((error) => {
  console.error('오류 발생:', error);
  rl.close();
  process.exit(1);
});
