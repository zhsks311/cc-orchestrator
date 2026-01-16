#!/usr/bin/env node
/**
 * CC Orchestrator Setup Script
 * Unified installation script - handles API key input, build, hooks/skills/settings
 *
 * Usage:
 *   npm run setup              # Interactive installation
 *   npm run setup -- --force   # Reinstall all components
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
  'arch': {
    primary: 'openai',
    fallbacks: ['anthropic', 'google'],
    description: 'Architecture design, strategic decisions, code review'
  },
  'index': {
    primary: 'anthropic',
    fallbacks: ['google', 'openai'],
    description: 'Documentation search, codebase analysis'
  },
  'canvas': {
    primary: 'google',
    fallbacks: ['anthropic', 'openai'],
    description: 'UI/UX design, frontend implementation'
  },
  'quill': {
    primary: 'google',
    fallbacks: ['anthropic', 'openai'],
    description: 'Technical documentation, README, API docs'
  },
  'lens': {
    primary: 'google',
    fallbacks: ['anthropic', 'openai'],
    description: 'Image, PDF analysis'
  },
  'scout': {
    primary: 'anthropic',
    fallbacks: ['google', 'openai'],
    description: 'Codebase exploration (Claude Sonnet)'
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

  console.log('\nAgent Availability:\n');

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
      // No API key - delegate to Claude Code (always available)
      status = '✓';
      provider = null;
      delegated = true;
    }

    const providerInfo = delegated ? '(Claude Code delegate)' : `(${provider})`;
    const statusIcon = status === '✓' ? '✓' : '⚠ fallback';

    console.log(`  ${role.padEnd(20)} ${statusIcon.padEnd(12)} ${providerInfo.padEnd(18)} - ${config.description}`);

    results.push({
      role,
      available: true,  // Always available (delegation supported)
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
  console.log(`  All ${totalAgents} agents available`);
  if (delegatedCount > 0) {
    console.log(`  (${delegatedCount} agents in Claude Code delegation mode)`);
  }
  if (fallbackCount > 0) {
    console.log(`  (${fallbackCount} agents using fallback provider)`);
  }

  return results;
}

// Generate ~/.cco/config.json based on available keys
function generateConfig(keys) {
  const availableProviders = getAvailableProviders(keys);

  if (availableProviders.length === 0) {
    console.log('\n⚠ No available API keys, cannot generate config file.');
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
    // Skip scout (always uses anthropic/free)
    if (role === 'scout') continue;

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
    console.error('Failed to save config file:', error.message);
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

  // MCP Server
  const distPath = path.join(rootDir, 'dist', 'index.js');
  if (fs.existsSync(distPath)) {
    results.mcp = { ok: true, message: normalizePath(distPath) };
  } else {
    results.mcp = { ok: false, message: 'dist/index.js not found' };
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
        message: `Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`,
        count: hooksManifest.files.length - missing.length
      };
    }
  } else {
    results.hooks = { ok: false, message: 'Not installed or different project', count: 0 };
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
        message: `Missing: ${missing.join(', ')}`,
        count: skillsManifest.files.length - missing.length
      };
    }
  } else {
    results.skills = { ok: false, message: 'Not installed or different project', count: 0 };
  }

  // Desktop config
  if (fs.existsSync(claudeDesktopConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(claudeDesktopConfigPath, 'utf8'));
      if (cfg.mcpServers?.['cc-orchestrator']) {
        results.config = { ok: true, message: 'Registered' };
      } else {
        results.config = { ok: false, message: 'MCP server not registered' };
      }
    } catch {
      results.config = { ok: false, message: 'Failed to read config file' };
    }
  } else {
    results.config = { ok: false, message: 'Config file not found' };
  }

  return results;
}

function printVerificationResults(results) {
  console.log('\n[Verify] Checking installation status...');

  const icon = (ok) => ok ? '✓' : '✗';

  console.log(`      MCP Server:   ${icon(results.mcp.ok)} ${results.mcp.message}`);
  console.log(`      Hooks:        ${icon(results.hooks.ok)} ${results.hooks.message}${results.hooks.count ? ` (${results.hooks.count} files)` : ''}`);
  console.log(`      Skills:       ${icon(results.skills.ok)} ${results.skills.message}${results.skills.count ? ` (${results.skills.count} files)` : ''}`);
  console.log(`      Desktop Config: ${icon(results.config.ok)} ${results.config.message}`);

  const allOk = results.mcp.ok && results.hooks.ok && results.skills.ok && results.config.ok;

  if (allOk) {
    console.log('\n✅ All components installed successfully!');
  } else {
    console.log('\n⚠️  Some components have issues.');
    console.log('   Fix: npx cc-orch --force');
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
  console.log('Current installation status:');
  console.log(`  node_modules:     ${status.nodeModules ? '✓' : '✗'}`);
  console.log(`  Build (dist):     ${status.dist ? '✓' : '✗'}`);

  // Hooks status with version info
  if (status.hooks.corrupted) {
    console.log(`  Hooks:            ✗ Files corrupted (reinstall required)`);
  } else if (status.hooks.installed) {
    const hooksStatus = status.hooks.needsUpdate
      ? `✓ v${status.hooks.version} → v${CURRENT_VERSION} update available`
      : `✓ v${status.hooks.version} (latest)`;
    console.log(`  Hooks:            ${hooksStatus}`);
  } else {
    console.log(`  Hooks:            ✗ Not installed`);
  }

  // Skills status with version info
  if (status.skills.corrupted) {
    console.log(`  Skills:           ✗ Files corrupted (reinstall required)`);
  } else if (status.skills.installed) {
    const skillsStatus = status.skills.needsUpdate
      ? `✓ v${status.skills.version} → v${CURRENT_VERSION} update available`
      : `✓ v${status.skills.version} (latest)`;
    console.log(`  Skills:           ${skillsStatus}`);
  } else {
    console.log(`  Skills:           ✗ Not installed`);
  }

  console.log(`  Desktop Config:   ${status.desktopConfig ? '✓' : '✗'}`);
  console.log(`  CCO Config:       ${status.ccoConfig ? '✓' : '✗'}`);
  console.log('');

  // Handle different installation modes
  let shouldProceed = true;

  // Skip if already up-to-date and no corruption
  const hasCorruption = status.hooks.corrupted || status.skills.corrupted;
  if (installMode.mode === 'current' && !forceMode && !hasCorruption) {
    console.log(`✅ CC Orchestrator v${CURRENT_VERSION} is already up to date.`);
    console.log('   To reinstall: npm run setup -- --force\n');
    rl.close();
    return;
  }

  if (installMode.mode === 'upgrade') {
    console.log(`📦 Upgrade detected: v${installMode.fromVersion} → v${installMode.toVersion}`);
  }

  if (installMode.mode === 'conflict') {
    console.log('⚠️  Other project files found in ~/.claude/.');
    if (installMode.hasHooks) console.log('   - hooks/ folder contains non-cc-orchestrator files');
    if (installMode.hasSkills) console.log('   - skills/ folder contains non-cc-orchestrator files');
    console.log('');

    if (yesMode) {
      console.log('--yes mode: Proceeding with merge.\n');
    } else {
      const conflictChoice = await question('How would you like to proceed?\n  1) Merge (add cc-orchestrator files only)\n  2) Cancel\n\nChoice (1/2): ');

      if (conflictChoice !== '1') {
        console.log('\nInstallation cancelled.\n');
        rl.close();
        return;
      }
      console.log('');
    }
  }

  if (installMode.mode === 'fresh') {
    console.log('🆕 Starting fresh installation.');
  }

  // Check if all components need installation
  const allInstalled = status.nodeModules && status.dist &&
                       status.hooks.installed && !status.hooks.needsUpdate &&
                       status.skills.installed && !status.skills.needsUpdate &&
                       status.desktopConfig && status.ccoConfig;

  if (allInstalled && !forceMode) {
    console.log('✅ All components are already installed.');
    console.log('   To reinstall: npm run setup -- --force\n');
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
    console.log('\nAPI Key Setup (press Enter to skip)\n');

    const inputOpenai = await question(`OpenAI API Key${openaiKey ? ' [keep existing]' : ''}: `);
    const inputGoogle = await question(`Google API Key${googleKey ? ' [keep existing]' : ''}: `);
    const inputAnthropic = await question(`Anthropic API Key${anthropicKey ? ' [keep existing]' : ''}: `);

    // Use new keys if provided, otherwise keep existing
    if (inputOpenai) openaiKey = inputOpenai;
    if (inputGoogle) googleKey = inputGoogle;
    if (inputAnthropic) anthropicKey = inputAnthropic;

    console.log('\nAPI Keys status:');
    console.log(`  OpenAI:    ${openaiKey ? '✓ Set' : '✗ Not set'}`);
    console.log(`  Google:    ${googleKey ? '✓ Set' : '✗ Not set'}`);
    console.log(`  Anthropic: ${anthropicKey ? '✓ Set' : '✗ Not set'}`);
  } else {
    console.log('API Keys: Using existing configuration');
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
    console.log('[2/7] Build: Already complete (skipped)');
  }

  // 3. Install Hooks
  const shouldInstallHooks = !status.hooks.installed || status.hooks.needsUpdate || forceMode;
  if (shouldInstallHooks) {
    console.log('[3/7] Installing Hooks...');
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
      console.log(`      ✓ Done: ${claudeHooksDir} (${copiedFiles.length} files)`);
    }
  } else {
    console.log(`[3/7] Hooks: v${status.hooks.version} is latest (skipped)`);
  }

  // 4. Install Skills
  const shouldInstallSkills = !status.skills.installed || status.skills.needsUpdate || forceMode;
  if (shouldInstallSkills) {
    console.log('[4/7] Installing Skills...');
    const srcSkillsDir = path.join(rootDir, 'skills');
    if (fs.existsSync(srcSkillsDir)) {
      const copiedFiles = copyDirRecursive(srcSkillsDir, claudeSkillsDir, ['.cco-manifest.json']);

      // Write manifest
      writeManifest(skillsManifestPath, copiedFiles);
      console.log(`      ✓ Done: ${claudeSkillsDir} (${copiedFiles.length} files)`);
    }
  } else {
    console.log(`[4/7] Skills: v${status.skills.version} is latest (skipped)`);
  }

  // 5. Update settings.json and desktop config
  console.log('[5/7] Updating Claude settings...');

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
    console.log('      ✓ settings.json updated');
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
    console.log('      ✓ claude_desktop_config.json updated');
  } catch (e) {
    console.log('      ⚠ desktop config update failed: ' + e.message);
  }

  // 6. Generate CCO config file
  console.log('[6/7] Generating CCO config file...');
  const ccoConfig = generateConfig(currentKeys);
  if (ccoConfig && saveConfig(ccoConfig)) {
    console.log('      ✓ Done: ' + ccoConfigPath);
    console.log('      Provider priority: ' + ccoConfig.providers.priority.join(' > '));
    if (Object.keys(ccoConfig.roles).length > 0) {
      console.log('      Role settings: ' + Object.keys(ccoConfig.roles).join(', '));
    }
  } else if (!ccoConfig) {
    console.log('      ⚠ No API keys, config file not generated');
  }

  // 7. Verify installation
  console.log('[7/7] Verifying installation...');
  const verifyResults = verifyInstallation();
  const allOk = printVerificationResults(verifyResults);

  // Done
  console.log('\n' + '═'.repeat(60));

  if (allOk) {
    console.log('\n✅ CC Orchestrator v' + CURRENT_VERSION + ' installation complete!');
  } else {
    console.log('\n⚠️  CC Orchestrator installation completed with some issues.');
  }

  console.log('\nNext steps:');
  console.log('  1. Restart Claude Code');
  console.log('  2. Test with "ask arch to review this project"\n');

  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});
