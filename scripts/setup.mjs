#!/usr/bin/env node
/**
 * CC Orchestrator Setup Script
 * Unified installation script - handles API key input, build, hooks/skills/settings
 *
 * Usage:
 *   npm run setup              # Interactive installation
 *   npm run setup -- --force   # Reinstall all components
 *   npm run setup -- --keys    # Reconfigure API keys only
 *   npm run setup -- --yes     # Non-interactive mode (skip prompts)
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
const claudeAgentsDir = path.join(claudeDir, 'agents');
const claudeSettingsPath = path.join(claudeDir, 'settings.json');
// Claude Code global config (NOT Claude Desktop)
const claudeCodeConfigPath = path.join(homeDir, '.claude.json');

// Manifest file paths for version tracking
const hooksManifestPath = path.join(claudeHooksDir, '.cco-manifest.json');
const skillsManifestPath = path.join(claudeSkillsDir, '.cco-manifest.json');
const agentsManifestPath = path.join(claudeAgentsDir, '.cco-manifest.json');

// Get current version from package.json
const packageJsonPath = path.join(rootDir, 'package.json');
const CURRENT_VERSION = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;

// Parse args
const args = process.argv.slice(2);
const forceMode = args.includes('--force') || args.includes('-f');
const yesMode = args.includes('--yes') || args.includes('-y');
const keysMode = args.includes('--keys') || args.includes('-k');

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

// Read API keys from Claude Code config (~/.claude.json)
function loadExistingKeys() {
  const keys = {
    OPENAI_API_KEY: '',
    GOOGLE_API_KEY: '',
    ANTHROPIC_API_KEY: ''
  };

  if (fs.existsSync(claudeCodeConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf8'));
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
// Note: scout and index are now Claude Code Agents (free, no API cost)
const AGENT_PROVIDERS = {
  'arch': {
    primary: 'openai',
    fallbacks: ['anthropic', 'google'],
    description: 'Architecture design, strategic decisions, code review'
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

// ============================================================
// Serena MCP installation helpers
// ============================================================

function checkUvxInstalled() {
  try {
    execSync('uvx --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkPipxInstalled() {
  try {
    execSync('pipx --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getSerenaCommand() {
  if (checkUvxInstalled()) {
    return { command: 'uvx', args: ['serena'] };
  }
  if (checkPipxInstalled()) {
    return { command: 'pipx', args: ['run', 'serena'] };
  }
  return null;
}

function checkSerenaInstalled() {
  if (!fs.existsSync(claudeCodeConfigPath)) return false;
  try {
    const cfg = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf8'));
    return !!(cfg?.mcpServers?.serena);
  } catch (e) {
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

  // 1. cc-orchestrator installed with different version → upgrade
  if (hooksManifest?.name === 'cc-orchestrator' && hooksManifest.version !== CURRENT_VERSION) {
    return {
      mode: 'upgrade',
      fromVersion: hooksManifest.version,
      toVersion: CURRENT_VERSION
    };
  }

  // 2. cc-orchestrator installed with same version → current
  if (hooksManifest?.name === 'cc-orchestrator' && hooksManifest.version === CURRENT_VERSION) {
    return {
      mode: 'current',
      version: CURRENT_VERSION
    };
  }

  // 3. Other project files exist (no manifest) → conflict
  if ((hooksExist && !hooksManifest) || (skillsExist && !skillsManifest)) {
    return {
      mode: 'conflict',
      hasHooks: hooksExist && !hooksManifest,
      hasSkills: skillsExist && !skillsManifest
    };
  }

  // 4. Fresh installation
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
    agents: { ok: false, message: '', count: 0 },
    config: { ok: false, message: '' },
    serena: { ok: false, message: '', optional: true }
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

  // Agents (Claude Code Agents - scout, index)
  const agentsManifest = readManifest(agentsManifestPath);
  if (agentsManifest?.name === 'cc-orchestrator') {
    const missing = agentsManifest.files.filter(f =>
      !fs.existsSync(path.join(claudeAgentsDir, f))
    );
    if (missing.length === 0) {
      results.agents = {
        ok: true,
        message: `v${agentsManifest.version}`,
        count: agentsManifest.files.length
      };
    } else {
      results.agents = {
        ok: false,
        message: `Missing: ${missing.join(', ')}`,
        count: agentsManifest.files.length - missing.length
      };
    }
  } else {
    results.agents = { ok: false, message: 'Not installed or different project', count: 0 };
  }

  // Claude Code config (~/.claude.json)
  if (fs.existsSync(claudeCodeConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf8'));
      if (cfg.mcpServers?.['cc-orchestrator']) {
        results.config = { ok: true, message: 'Registered' };
      } else {
        results.config = { ok: false, message: 'MCP server not registered' };
      }

      // Serena check
      if (cfg.mcpServers?.['serena']) {
        results.serena = { ok: true, message: 'Registered', optional: true };
      } else {
        results.serena = { ok: false, message: 'Not installed (optional)', optional: true };
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

  const icon = (ok, optional = false) => {
    if (ok) return '✓';
    return optional ? '○' : '✗';
  };

  console.log(`      MCP Server:     ${icon(results.mcp.ok)} ${results.mcp.message}`);
  console.log(`      Hooks:          ${icon(results.hooks.ok)} ${results.hooks.message}${results.hooks.count ? ` (${results.hooks.count} files)` : ''}`);
  console.log(`      Skills:         ${icon(results.skills.ok)} ${results.skills.message}${results.skills.count ? ` (${results.skills.count} files)` : ''}`);
  console.log(`      Agents:         ${icon(results.agents.ok)} ${results.agents.message}${results.agents.count ? ` (${results.agents.count} files)` : ''}`);
  console.log(`      Claude Code:    ${icon(results.config.ok)} ${results.config.message}`);
  console.log(`      Serena MCP:     ${icon(results.serena.ok, true)} ${results.serena.message}`);

  const allOk = results.mcp.ok && results.hooks.ok && results.skills.ok && results.agents.ok && results.config.ok;

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
  const agentsManifest = readManifest(agentsManifestPath);

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
    agents: {
      installed: agentsManifest?.name === 'cc-orchestrator',
      version: agentsManifest?.version || null,
      needsUpdate: needsUpdate(agentsManifestPath),
      corrupted: false
    },
    claudeCodeConfig: false,
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

  // Verify actual agent files exist (not just manifest)
  if (agentsManifest?.name === 'cc-orchestrator' && agentsManifest.files) {
    const missing = agentsManifest.files.filter(f =>
      !fs.existsSync(path.join(claudeAgentsDir, f))
    );
    if (missing.length > 0) {
      status.agents.installed = false;
      status.agents.corrupted = true;
    }
  }

  // Check Claude Code config (~/.claude.json)
  if (fs.existsSync(claudeCodeConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf8'));
      status.claudeCodeConfig = !!(cfg.mcpServers && cfg.mcpServers['cc-orchestrator']);
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

  // Agents status with version info
  if (status.agents.corrupted) {
    console.log(`  Agents:           ✗ Files corrupted (reinstall required)`);
  } else if (status.agents.installed) {
    const agentsStatus = status.agents.needsUpdate
      ? `✓ v${status.agents.version} → v${CURRENT_VERSION} update available`
      : `✓ v${status.agents.version} (latest)`;
    console.log(`  Agents:           ${agentsStatus}`);
  } else {
    console.log(`  Agents:           ✗ Not installed`);
  }

  console.log(`  Claude Code:      ${status.claudeCodeConfig ? '✓' : '✗'}`);
  console.log(`  CCO Config:       ${status.ccoConfig ? '✓' : '✗'}`);
  console.log('');

  // Handle different installation modes
  let shouldProceed = true;

  // Skip if already up-to-date and no corruption
  const hasCorruption = status.hooks.corrupted || status.skills.corrupted || status.agents.corrupted;
  const needsBuild = !status.dist;
  if (installMode.mode === 'current' && !forceMode && !hasCorruption && !needsBuild) {
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
                       status.agents.installed && !status.agents.needsUpdate &&
                       status.claudeCodeConfig && status.ccoConfig;

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

  // Show API key input if: not in yes mode AND (no config OR force mode OR keys mode OR no existing keys)
  const hasAnyExistingKey = openaiKey || googleKey || anthropicKey;
  if (!yesMode && (!status.claudeCodeConfig || forceMode || keysMode || !hasAnyExistingKey)) {
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

  // Serena MCP installation option
  let installSerena = false;
  const serenaCmd = getSerenaCommand();

  // Check if Serena is already installed
  const serenaAlreadyInstalled = checkSerenaInstalled();

  if (!yesMode && !serenaAlreadyInstalled) {
    console.log('\n─'.repeat(60));
    console.log('\nSerena MCP - LSP Integration (Optional)\n');
    console.log('  Serena provides Language Server Protocol tools for:');
    console.log('  • Symbol search (find definitions, references)');
    console.log('  • Code navigation (go to definition)');
    console.log('  • 30+ language support\n');

    if (serenaCmd) {
      console.log(`  ✓ ${serenaCmd.command} detected - ready to install`);
      const serenaChoice = await question('\nInstall Serena MCP? (y/N): ');
      installSerena = serenaChoice.toLowerCase() === 'y';
    } else {
      console.log('  ⚠ uvx or pipx required for Serena installation');
      console.log('    Install with: pip install uv  (recommended)');
      console.log('    Or: pip install pipx');
      console.log('    You can add Serena later by re-running setup.\n');
    }
  } else if (serenaAlreadyInstalled) {
    console.log('\n  Serena MCP: Already installed ✓');
    installSerena = true; // Keep existing installation
  }

  if (!yesMode) {
    const confirm = await question('\nProceed with installation? (Y/n): ');
    if (confirm.toLowerCase() === 'n') {
      console.log('\nInstallation cancelled.\n');
      rl.close();
      return;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Starting installation...\n');

  // 1. npm install
  if (!status.nodeModules || forceMode) {
    console.log('[1/8] Installing dependencies (npm install)...');
    try {
      execSync('npm install', { cwd: rootDir, stdio: 'inherit' });
      console.log('      ✓ Done');
    } catch (error) {
      console.error('      ✗ Failed');
      rl.close();
      process.exit(1);
    }
  } else {
    console.log('[1/8] node_modules: Already exists (skipped)');
  }

  // 2. Build
  if (!status.dist || forceMode) {
    console.log('[2/8] Building (npm run build)...');
    try {
      execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
      console.log('      ✓ Done');
    } catch (error) {
      console.error('      ✗ Failed');
      rl.close();
      process.exit(1);
    }
  } else {
    console.log('[2/8] Build: Already complete (skipped)');
  }

  // 3. Install Hooks
  const shouldInstallHooks = !status.hooks.installed || status.hooks.needsUpdate || forceMode;
  if (shouldInstallHooks) {
    console.log('[3/8] Installing Hooks...');
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
    console.log(`[3/8] Hooks: v${status.hooks.version} is latest (skipped)`);
  }

  // 4. Install Skills
  const shouldInstallSkills = !status.skills.installed || status.skills.needsUpdate || forceMode;
  if (shouldInstallSkills) {
    console.log('[4/8] Installing Skills...');
    const srcSkillsDir = path.join(rootDir, 'skills');
    if (fs.existsSync(srcSkillsDir)) {
      const copiedFiles = copyDirRecursive(srcSkillsDir, claudeSkillsDir, ['.cco-manifest.json']);

      // Write manifest
      writeManifest(skillsManifestPath, copiedFiles);
      console.log(`      ✓ Done: ${claudeSkillsDir} (${copiedFiles.length} files)`);
    }
  } else {
    console.log(`[4/8] Skills: v${status.skills.version} is latest (skipped)`);
  }

  // 5. Install Agents (Claude Code Agents - scout, index)
  const shouldInstallAgents = !status.agents.installed || status.agents.needsUpdate || forceMode;
  if (shouldInstallAgents) {
    console.log('[5/8] Installing Agents...');
    const srcAgentsDir = path.join(rootDir, 'agents');
    if (fs.existsSync(srcAgentsDir)) {
      const copiedFiles = copyDirRecursive(srcAgentsDir, claudeAgentsDir, ['.cco-manifest.json']);

      // Write manifest
      writeManifest(agentsManifestPath, copiedFiles);
      console.log(`      ✓ Done: ${claudeAgentsDir} (${copiedFiles.length} files)`);
    }
  } else {
    console.log(`[5/8] Agents: v${status.agents.version} is latest (skipped)`);
  }

  // 6. Update settings.json and desktop config
  console.log('[6/8] Updating Claude settings...');

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
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const templateStr = JSON.stringify(template)
      .split('{{HOOKS_PATH}}').join(hooksPath)
      .split('{{PYTHON}}').join(pythonCmd);
    const resolved = JSON.parse(templateStr);
    const merged = { ...existing };
    if (resolved.hooks) {
      merged.hooks = merged.hooks || {};
      for (const [event, hooks] of Object.entries(resolved.hooks)) {
        merged.hooks[event] = merged.hooks[event] || [];

        // Clean up old cco hooks without ID (migration from old versions)
        // Remove hooks that contain .claude/hooks/ path but have no ID
        merged.hooks[event] = merged.hooks[event].filter(h => {
          if (h.id && h.id.startsWith('cco:')) return true; // Keep ID-based cco hooks
          if (!h.id) {
            // Check if this is an old cco hook (contains .claude/hooks/ path)
            const hasClaudeHooksPath = h.hooks?.some(cmd =>
              cmd.command && cmd.command.includes('.claude/hooks/')
            );
            if (hasClaudeHooksPath) return false; // Remove old cco hooks without ID
          }
          return true; // Keep non-cco hooks
        });

        // ID-based upsert for new hooks
        for (const newHook of hooks) {
          if (newHook.id) {
            // ID-based: find existing hook with same ID
            const existingIndex = merged.hooks[event].findIndex(h => h.id === newHook.id);
            if (existingIndex >= 0) {
              // Update existing hook
              merged.hooks[event][existingIndex] = newHook;
            } else {
              // Add new hook
              merged.hooks[event].push(newHook);
            }
          } else {
            // No ID: use legacy logic (for backwards compatibility)
            if (!merged.hooks[event].some(h => JSON.stringify(h.hooks) === JSON.stringify(newHook.hooks))) {
              merged.hooks[event].push(newHook);
            }
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

  // Update Claude Code config (~/.claude.json)
  try {
    let cfg = {};
    if (fs.existsSync(claudeCodeConfigPath)) {
      cfg = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf8'));
      fs.copyFileSync(claudeCodeConfigPath, claudeCodeConfigPath + '.backup');
    }
    cfg.mcpServers = cfg.mcpServers || {};

    const indexPath = normalizePath(path.join(rootDir, 'dist', 'index.js'));

    // Remove duplicates (old entries pointing to same path)
    for (const [key, value] of Object.entries(cfg.mcpServers)) {
      if (key !== 'cc-orchestrator' && value.args && value.args[0]) {
        if (normalizePath(value.args[0]) === indexPath) {
          delete cfg.mcpServers[key];
        }
      }
    }

    // Claude Code MCP format includes 'type: stdio'
    cfg.mcpServers['cc-orchestrator'] = {
      type: 'stdio',
      command: 'node',
      args: [indexPath],
      env: {
        OPENAI_API_KEY: openaiKey || '',
        GOOGLE_API_KEY: googleKey || '',
        ANTHROPIC_API_KEY: anthropicKey || ''
      }
    };

    // Add Serena MCP if requested
    if (installSerena && serenaCmd) {
      cfg.mcpServers['serena'] = {
        type: 'stdio',
        command: serenaCmd.command,
        args: serenaCmd.args
      };
      console.log('      ✓ Serena MCP registered');
    } else if (serenaAlreadyInstalled) {
      // Keep existing Serena configuration
      console.log('      ✓ Serena MCP preserved');
    }

    fs.writeFileSync(claudeCodeConfigPath, JSON.stringify(cfg, null, 2));
    console.log('      ✓ ~/.claude.json updated');
  } catch (e) {
    console.log('      ⚠ Claude Code config update failed: ' + e.message);
  }

  // 6. Generate CCO config file
  console.log('[7/8] Generating CCO config file...');
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
  console.log('[8/8] Verifying installation...');
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
