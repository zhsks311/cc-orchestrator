#!/usr/bin/env node
/**
 * CCMO Uninstall Script - Full cleanup
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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
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

async function main() {
  console.log('\n=== CCMO Uninstall Wizard ===\n');

  console.log('This script will remove CCMO components.\n');
  console.log('Components:');
  console.log('  1. Local: .env, dist/, node_modules/');
  console.log('  2. Hooks: ~/.claude/hooks/ (CCMO files)');
  console.log('  3. Skills: ~/.claude/skills/orchestrate/');
  console.log('  4. Settings: ~/.claude/settings.json (CCMO hooks)');
  console.log('  5. Desktop Config: ccmo entry\n');

  console.log('Options:');
  console.log('  1. Full uninstall (all components)');
  console.log('  2. Local only (.env + dist + node_modules)');
  console.log('  3. Claude config only (hooks, skills, settings)');
  console.log('  4. Cancel\n');

  const choice = await question('Select (1-4): ');

  let removeLocal = false;
  let removeClaudeConfig = false;

  switch (choice) {
    case '1': removeLocal = true; removeClaudeConfig = true; break;
    case '2': removeLocal = true; break;
    case '3': removeClaudeConfig = true; break;
    default: console.log('\nCancelled.\n'); rl.close(); return;
  }

  const confirm = await question('\nProceed? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('\nCancelled.\n');
    rl.close();
    return;
  }

  console.log('\nRemoving...\n');

  if (removeLocal) {
    if (deleteFile(path.join(rootDir, '.env'))) console.log('  Removed: .env');
    if (deleteFolderRecursive(path.join(rootDir, 'dist'))) console.log('  Removed: dist/');
    if (deleteFolderRecursive(path.join(rootDir, 'node_modules'))) console.log('  Removed: node_modules/');
  }

  if (removeClaudeConfig) {
    // Remove hooks (keep folder, remove CCMO files)
    const ccmoHooks = [
      'api_key_loader.py', 'collect_project_context.py', 'completion_orchestrator.py',
      'config.json', 'debate_orchestrator.py', 'intent_extractor.py', 'quota_monitor.py',
      'review_completion_wrapper.py', 'review_orchestrator.py', 'review_test_wrapper.py',
      'security.py', 'state_manager.py', 'todo_state_detector.py'
    ];
    for (const file of ccmoHooks) {
      deleteFile(path.join(claudeHooksDir, file));
    }
    deleteFolderRecursive(path.join(claudeHooksDir, 'adapters'));
    deleteFolderRecursive(path.join(claudeHooksDir, 'prompts'));
    console.log('  Removed: CCMO hooks');

    // Remove orchestrate skill
    if (deleteFolderRecursive(path.join(claudeSkillsDir, 'orchestrate'))) {
      console.log('  Removed: orchestrate skill');
    }

    // Remove ccmo from desktop config
    try {
      if (fs.existsSync(claudeDesktopConfigPath)) {
        const cfg = JSON.parse(fs.readFileSync(claudeDesktopConfigPath, 'utf8'));
        if (cfg.mcpServers && cfg.mcpServers.ccmo) {
          delete cfg.mcpServers.ccmo;
          fs.writeFileSync(claudeDesktopConfigPath, JSON.stringify(cfg, null, 2));
          console.log('  Removed: ccmo from desktop config');
        }
      }
    } catch (e) {
      console.log('  Warning: Could not update desktop config');
    }

    // Note about settings.json (manual cleanup recommended)
    console.log('\n  Note: Check ~/.claude/settings.json for CCMO hooks manually');
  }

  console.log('\n=== Uninstall Complete ===');
  console.log('Restart Claude Code to apply changes.\n');

  rl.close();
}

main().catch(e => { console.error(e); rl.close(); process.exit(1); });
