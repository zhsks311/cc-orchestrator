#!/usr/bin/env node
/**
 * CC Orchestrator Uninstall Script - Full cleanup
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

const isWindows = process.platform === 'win32';
const homeDir = os.homedir();
const claudeDir = path.join(homeDir, '.claude');
const claudeHooksDir = path.join(claudeDir, 'hooks');
const claudeSkillsDir = path.join(claudeDir, 'skills');
const claudeSettingsPath = path.join(claudeDir, 'settings.json');
const claudeDesktopConfigPath = isWindows
  ? path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json')
  : path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

// Parse command line arguments
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

function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// Normalize path for cross-platform compatibility
function normalizePath(p) {
  return p.split(path.sep).join('/');
}

// Clean CC Orchestrator hooks from settings.json
function cleanSettingsJson() {
  if (!fs.existsSync(claudeSettingsPath)) {
    return false;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));

    if (!settings.hooks) {
      return false;
    }

    let modified = false;
    const hooksDir = normalizePath(claudeHooksDir);

    // Filter out CC Orchestrator hooks from each event
    for (const event of Object.keys(settings.hooks)) {
      if (Array.isArray(settings.hooks[event])) {
        const originalLength = settings.hooks[event].length;
        settings.hooks[event] = settings.hooks[event].filter(hookEntry => {
          // Check if any hook command references our hooks directory
          if (hookEntry.hooks && Array.isArray(hookEntry.hooks)) {
            const hasCCOHook = hookEntry.hooks.some(h => {
              const cmd = h.command || '';
              const normalizedCmd = normalizePath(cmd);
              return normalizedCmd.includes(hooksDir) ||
                     normalizedCmd.includes('.claude/hooks/');
            });
            return !hasCCOHook;
          }
          return true;
        });
        if (settings.hooks[event].length !== originalLength) {
          modified = true;
        }
        // Remove empty arrays
        if (settings.hooks[event].length === 0) {
          delete settings.hooks[event];
        }
      }
    }

    // Remove empty hooks object
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    if (modified) {
      // Backup original
      fs.copyFileSync(claudeSettingsPath, claudeSettingsPath + '.backup');
      fs.writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2));
      return true;
    }
  } catch (e) {
    console.log('  Warning: Could not clean settings.json:', e.message);
  }
  return false;
}

function removeLocalFiles() {
  console.log('\n[Local Files]');
  if (deleteFile(path.join(rootDir, '.env'))) console.log('  Removed: .env');
  if (deleteFolderRecursive(path.join(rootDir, 'dist'))) console.log('  Removed: dist/');
  if (deleteFolderRecursive(path.join(rootDir, 'node_modules'))) console.log('  Removed: node_modules/');
}

function removeClaudeConfig() {
  // IMPORTANT: Clean settings.json FIRST to prevent hook errors
  console.log('\n[Settings] Cleaning hooks from settings.json...');
  if (cleanSettingsJson()) {
    console.log('  Removed: CC Orchestrator hooks from settings.json');
    console.log('  Backup: settings.json.backup');
  } else {
    console.log('  No CC Orchestrator hooks found in settings.json');
  }

  // THEN remove hook files
  console.log('\n[Hooks] Removing hook files...');
  const ccoHooks = [
    'api_key_loader.py', 'collect_project_context.py', 'completion_orchestrator.py',
    'config.json', 'debate_orchestrator.py', 'intent_extractor.py', 'quota_monitor.py',
    'review_completion_wrapper.py', 'review_orchestrator.py', 'review_test_wrapper.py',
    'security.py', 'state_manager.py', 'todo_state_detector.py'
  ];
  let removedCount = 0;
  for (const file of ccoHooks) {
    if (deleteFile(path.join(claudeHooksDir, file))) removedCount++;
  }
  if (deleteFolderRecursive(path.join(claudeHooksDir, 'adapters'))) removedCount++;
  if (deleteFolderRecursive(path.join(claudeHooksDir, 'prompts'))) removedCount++;
  if (deleteFolderRecursive(path.join(claudeHooksDir, 'context_resilience'))) removedCount++;
  // Remove hooks manifest
  if (deleteFile(path.join(claudeHooksDir, '.cco-manifest.json'))) {
    removedCount++;
    console.log('  Removed: .cco-manifest.json');
  }
  console.log(`  Removed: ${removedCount} hook files/folders`);

  // Remove skills
  console.log('\n[Skills] Removing CC Orchestrator skills...');
  let skillsRemoved = 0;
  if (deleteFolderRecursive(path.join(claudeSkillsDir, 'orchestrate'))) {
    console.log('  Removed: orchestrate skill');
    skillsRemoved++;
  }
  if (deleteFolderRecursive(path.join(claudeSkillsDir, 'checkpoint'))) {
    console.log('  Removed: checkpoint skill');
    skillsRemoved++;
  }
  // Remove skills manifest
  if (deleteFile(path.join(claudeSkillsDir, '.cco-manifest.json'))) {
    console.log('  Removed: skills .cco-manifest.json');
    skillsRemoved++;
  }
  if (skillsRemoved === 0) {
    console.log('  Not found: CC Orchestrator skills');
  }

  // Remove cc-orchestrator from desktop config
  console.log('\n[Desktop Config] Removing MCP server entry...');
  try {
    if (fs.existsSync(claudeDesktopConfigPath)) {
      const content = fs.readFileSync(claudeDesktopConfigPath, 'utf8');
      const cfg = JSON.parse(content);
      let removed = false;
      if (cfg.mcpServers) {
        if (cfg.mcpServers['cc-orchestrator']) {
          delete cfg.mcpServers['cc-orchestrator'];
          removed = true;
        }
        if (cfg.mcpServers['ccmo']) {
          delete cfg.mcpServers['ccmo'];
          removed = true;
        }
      }
      if (removed) {
        fs.writeFileSync(claudeDesktopConfigPath, JSON.stringify(cfg, null, 2));
        console.log('  Removed: cc-orchestrator/ccmo from desktop config');
      } else {
        console.log('  Not found: cc-orchestrator in desktop config');
      }
    }
  } catch (e) {
    console.log('  Warning: Could not update desktop config:', e.message);
  }
}

async function main() {
  console.log('\n=== CC Orchestrator Uninstall ===\n');

  let removeLocal = false;
  let removeClaudeConfigFlag = false;

  if (forceMode) {
    // Non-interactive mode
    console.log('Running in non-interactive mode (--force)\n');
    if (localOnly) {
      removeLocal = true;
      console.log('Mode: Local only');
    } else if (claudeOnly) {
      removeClaudeConfigFlag = true;
      console.log('Mode: Claude config only');
    } else {
      removeLocal = true;
      removeClaudeConfigFlag = true;
      console.log('Mode: Full uninstall');
    }
  } else {
    // Interactive mode
    console.log('Components:');
    console.log('  1. Local: .env, dist/, node_modules/');
    console.log('  2. Hooks: ~/.claude/hooks/ (CC Orchestrator files)');
    console.log('  3. Skills: ~/.claude/skills/orchestrate/');
    console.log('  4. Settings: ~/.claude/settings.json (CC Orchestrator hooks)');
    console.log('  5. Desktop Config: cc-orchestrator entry\n');

    console.log('Options:');
    console.log('  1. Full uninstall (all components)');
    console.log('  2. Local only (.env + dist + node_modules)');
    console.log('  3. Claude config only (hooks, skills, settings)');
    console.log('  4. Cancel\n');

    const choice = await question('Select (1-4): ');

    switch (choice) {
      case '1': removeLocal = true; removeClaudeConfigFlag = true; break;
      case '2': removeLocal = true; break;
      case '3': removeClaudeConfigFlag = true; break;
      default: console.log('\nCancelled.\n'); rl.close(); return;
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
    removeClaudeConfig();
  }

  if (removeLocal) {
    removeLocalFiles();
  }

  console.log('\n=== Uninstall Complete ===');
  console.log('Restart Claude Code to apply changes.\n');

  if (rl) rl.close();
}

main().catch(e => { console.error(e); if (rl) rl.close(); process.exit(1); });
