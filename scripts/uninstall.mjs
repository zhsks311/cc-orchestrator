#!/usr/bin/env node
/**
 * CC Orchestrator Uninstall Script - Manifest-based full cleanup
 *
 * Reads .cco-manifest.json from each component directory to determine
 * exactly which files were installed, ensuring complete removal without
 * hardcoded file lists.
 *
 * Usage:
 *   npm run uninstall              # Interactive mode
 *   npm run uninstall -- --force   # Non-interactive, full uninstall
 *   npm run uninstall -- --force --claude-only  # Non-interactive, Claude config only
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const homeDir = os.homedir();
const claudeDir = path.join(homeDir, '.claude');
const ccoDir = path.join(homeDir, '.cco');
const claudeHooksDir = path.join(claudeDir, 'hooks');
const claudeSkillsDir = path.join(claudeDir, 'skills');
const claudeAgentsDir = path.join(claudeDir, 'agents');
const claudeSettingsPath = path.join(claudeDir, 'settings.json');
const claudeCodeConfigPath = path.join(homeDir, '.claude.json');

const hooksManifestPath = path.join(claudeHooksDir, '.cco-manifest.json');
const skillsManifestPath = path.join(claudeSkillsDir, '.cco-manifest.json');
const agentsManifestPath = path.join(claudeAgentsDir, '.cco-manifest.json');

const args = process.argv.slice(2);
const forceMode = args.includes('--force') || args.includes('-f');
const claudeOnly = args.includes('--claude-only') || args.includes('-c');
const localOnly = args.includes('--local-only') || args.includes('-l');

let rl;
if (!forceMode) {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
}

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, answer => resolve(answer.trim())));
}

function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

function normalizePath(p) {
  return p.split(path.sep).join('/');
}

// Read manifest from a component directory
function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== 'cc-orchestrator') return null;
    return manifest;
  } catch {
    return null;
  }
}

// Remove files listed in a manifest, then clean up empty parent directories
function removeByManifest(baseDir, manifestPath, label) {
  const manifest = readManifest(manifestPath);
  let removedCount = 0;

  console.log(`\n[${label}] Removing files...`);

  if (manifest && Array.isArray(manifest.files)) {
    console.log(`  Manifest: v${manifest.version}, ${manifest.files.length} files`);

    // Collect parent directories for cleanup
    const parentDirs = new Set();

    for (const file of manifest.files) {
      const filePath = path.join(baseDir, file);
      if (deleteFile(filePath)) {
        removedCount++;
        const dir = path.dirname(filePath);
        if (dir !== baseDir) parentDirs.add(dir);
      }
    }

    // Remove empty parent directories (deepest first)
    const sortedDirs = [...parentDirs].sort((a, b) => b.length - a.length);
    for (const dir of sortedDirs) {
      try {
        if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      } catch {
        // Directory not empty or permission issue - skip
      }
    }
  } else {
    console.log('  No manifest found, skipping file removal');
  }

  // Remove setup-generated auxiliary directories (hooks only)
  if (label === 'Hooks') {
    if (deleteFolderRecursive(path.join(baseDir, 'logs'))) removedCount++;
    if (deleteFolderRecursive(path.join(baseDir, 'state'))) removedCount++;
    if (deleteFile(path.join(baseDir, 'api_keys.json'))) removedCount++;
  }

  // Remove the manifest itself
  if (deleteFile(manifestPath)) removedCount++;

  console.log(`  Removed: ${removedCount} files/folders`);
  return removedCount;
}

// Clean CC Orchestrator hooks from settings.json
function cleanSettingsJson() {
  if (!fs.existsSync(claudeSettingsPath)) return false;

  try {
    const settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
    if (!settings.hooks) return false;

    let modified = false;
    const hooksDir = normalizePath(claudeHooksDir);

    for (const event of Object.keys(settings.hooks)) {
      if (!Array.isArray(settings.hooks[event])) continue;

      const originalLength = settings.hooks[event].length;
      settings.hooks[event] = settings.hooks[event].filter(hookEntry => {
        // Match by cco: ID prefix (setup registers hooks with this prefix)
        if (hookEntry.id && hookEntry.id.startsWith('cco:')) return false;

        // Fallback: match by hook command path (for legacy entries without ID)
        if (hookEntry.hooks && Array.isArray(hookEntry.hooks)) {
          const hasCCOHook = hookEntry.hooks.some(h => {
            const cmd = normalizePath(h.command || '');
            return cmd.includes(hooksDir) || cmd.includes('.claude/hooks/');
          });
          if (hasCCOHook) return false;
        }

        return true;
      });

      if (settings.hooks[event].length !== originalLength) modified = true;
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
    }

    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

    if (modified) {
      fs.copyFileSync(claudeSettingsPath, claudeSettingsPath + '.backup');
      fs.writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2));
      return true;
    }
  } catch (e) {
    console.log('  Warning: Could not clean settings.json:', e.message);
  }
  return false;
}

// Remove MCP server entries from ~/.claude.json
function removeMcpEntries(removeSerenaFlag) {
  console.log('\n[Claude Code] Removing MCP server entries...');
  try {
    if (!fs.existsSync(claudeCodeConfigPath)) return;

    const cfg = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf8'));
    if (!cfg.mcpServers) return;

    let removed = false;
    let serenaRemoved = false;

    for (const key of ['cc-orchestrator', 'ccmo']) {
      if (cfg.mcpServers[key]) {
        delete cfg.mcpServers[key];
        removed = true;
      }
    }

    if (cfg.mcpServers['serena'] && removeSerenaFlag) {
      delete cfg.mcpServers['serena'];
      serenaRemoved = true;
    }

    if (removed || serenaRemoved) {
      fs.writeFileSync(claudeCodeConfigPath, JSON.stringify(cfg, null, 2));
      if (removed) console.log('  Removed: cc-orchestrator/ccmo from ~/.claude.json');
      if (serenaRemoved) console.log('  Removed: serena from ~/.claude.json');
    } else {
      console.log('  Not found: cc-orchestrator in ~/.claude.json');
    }
  } catch (e) {
    console.log('  Warning: Could not update ~/.claude.json:', e.message);
  }
}

// Remove ~/.cco/ config directory
function removeCcoConfig() {
  console.log('\n[CCO Config] Removing ~/.cco/...');
  if (deleteFolderRecursive(ccoDir)) {
    console.log('  Removed: ~/.cco/');
  } else {
    console.log('  Not found: ~/.cco/');
  }
}

function removeLocalFiles() {
  console.log('\n[Local Files]');
  if (deleteFile(path.join(rootDir, '.env'))) console.log('  Removed: .env');
  if (deleteFolderRecursive(path.join(rootDir, 'dist'))) console.log('  Removed: dist/');
  if (deleteFolderRecursive(path.join(rootDir, 'node_modules'))) console.log('  Removed: node_modules/');
}

function removeClaudeConfig(removeSerenaFlag = false) {
  // IMPORTANT: Clean settings.json FIRST to prevent hook errors
  console.log('\n[Settings] Cleaning hooks from settings.json...');
  if (cleanSettingsJson()) {
    console.log('  Removed: CC Orchestrator hooks from settings.json');
    console.log('  Backup: settings.json.backup');
  } else {
    console.log('  No CC Orchestrator hooks found in settings.json');
  }

  // Remove component files via manifests
  removeByManifest(claudeHooksDir, hooksManifestPath, 'Hooks');
  removeByManifest(claudeSkillsDir, skillsManifestPath, 'Skills');
  removeByManifest(claudeAgentsDir, agentsManifestPath, 'Agents');

  // Remove MCP server entries
  removeMcpEntries(removeSerenaFlag);

  // Remove CCO config directory
  removeCcoConfig();
}

function checkSerenaInstalled() {
  try {
    if (fs.existsSync(claudeCodeConfigPath)) {
      const cfg = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf8'));
      return !!(cfg.mcpServers?.serena);
    }
  } catch {
    // Ignore read errors
  }
  return false;
}

// Summarize what will be removed
function printComponentSummary() {
  const hooksManifest = readManifest(hooksManifestPath);
  const skillsManifest = readManifest(skillsManifestPath);
  const agentsManifest = readManifest(agentsManifestPath);

  console.log('Installed components:');
  console.log(`  Hooks:      ${hooksManifest ? `v${hooksManifest.version} (${hooksManifest.files.length} files)` : 'Not found'}`);
  console.log(`  Skills:     ${skillsManifest ? `v${skillsManifest.version} (${skillsManifest.files.length} files)` : 'Not found'}`);
  console.log(`  Agents:     ${agentsManifest ? `v${agentsManifest.version} (${agentsManifest.files.length} files)` : 'Not found'}`);
  console.log(`  CCO Config: ${fs.existsSync(ccoDir) ? '~/.cco/' : 'Not found'}`);

  try {
    if (fs.existsSync(claudeCodeConfigPath)) {
      const cfg = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf8'));
      const hasMcp = !!(cfg.mcpServers?.['cc-orchestrator'] || cfg.mcpServers?.['ccmo']);
      console.log(`  MCP Server: ${hasMcp ? '~/.claude.json' : 'Not found'}`);
    }
  } catch {
    // Ignore
  }

  console.log('');
}

async function main() {
  console.log('\n=== CC Orchestrator Uninstall ===\n');

  let removeLocal = false;
  let removeClaudeConfigFlag = false;
  let removeSerena = false;

  const serenaInstalled = checkSerenaInstalled();

  if (forceMode) {
    console.log('Running in non-interactive mode (--force)\n');
    printComponentSummary();
    if (localOnly) {
      removeLocal = true;
      console.log('Mode: Local only');
    } else if (claudeOnly) {
      removeClaudeConfigFlag = true;
      removeSerena = serenaInstalled;
      console.log('Mode: Claude config only');
    } else {
      removeLocal = true;
      removeClaudeConfigFlag = true;
      removeSerena = serenaInstalled;
      console.log('Mode: Full uninstall');
    }
  } else {
    printComponentSummary();

    console.log('Options:');
    console.log('  1. Full uninstall (all components)');
    console.log('  2. Local only (.env + dist + node_modules)');
    console.log('  3. Claude config only (hooks, skills, agents, settings, MCP)');
    console.log('  4. Cancel\n');

    const choice = await question('Select (1-4): ');

    switch (choice) {
      case '1': removeLocal = true; removeClaudeConfigFlag = true; break;
      case '2': removeLocal = true; break;
      case '3': removeClaudeConfigFlag = true; break;
      default: console.log('\nCancelled.\n'); rl.close(); return;
    }

    if (serenaInstalled && removeClaudeConfigFlag) {
      const serenaChoice = await question('\nAlso remove Serena MCP? (y/N): ');
      removeSerena = ['y', 'yes'].includes(serenaChoice.toLowerCase());
    }

    const confirm = await question('\nProceed? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('\nCancelled.\n');
      rl.close();
      return;
    }
  }

  console.log('\nRemoving...');

  // IMPORTANT: Remove Claude config FIRST (settings before hooks)
  // This prevents hook errors during uninstall
  if (removeClaudeConfigFlag) {
    removeClaudeConfig(removeSerena);
  }

  if (removeLocal) {
    removeLocalFiles();
  }

  console.log('\n=== Uninstall Complete ===');
  console.log('Restart Claude Code to apply changes.\n');

  if (rl) rl.close();
}

main().catch(e => { console.error(e); if (rl) rl.close(); process.exit(1); });
