#!/usr/bin/env node
/**
 * CC Orchestrator Update Script
 * Fetch and update to the latest version from remote repository
 *
 * Usage:
 *   npm run update              # Run update
 *   npm run update -- --check   # Check for updates only
 */

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
const claudeHooksDir = path.join(claudeDir, 'hooks');
const claudeSkillsDir = path.join(claudeDir, 'skills');

// Parse args
const args = process.argv.slice(2);
const checkOnly = args.includes('--check') || args.includes('-c');

// Normalize path to use forward slashes
function normalizePath(p) {
  return p.split(path.sep).join('/');
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

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, { cwd: rootDir, encoding: 'utf8', ...options });
  } catch (error) {
    throw new Error(`Command failed: ${cmd}\n${error.message}`);
  }
}

function getCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function getLocalCommit() {
  try {
    return exec('git rev-parse HEAD', { stdio: 'pipe' }).trim().slice(0, 7);
  } catch {
    return null;
  }
}

function getRemoteCommit() {
  try {
    exec('git fetch origin', { stdio: 'pipe' });
    return exec('git rev-parse origin/main', { stdio: 'pipe' }).trim().slice(0, 7);
  } catch {
    return null;
  }
}

function hasUncommittedChanges() {
  try {
    const status = exec('git status --porcelain', { stdio: 'pipe' });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       CC Orchestrator - Update                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const currentVersion = getCurrentVersion();
  const localCommit = getLocalCommit();
  const remoteCommit = getRemoteCommit();

  console.log(`Current version: v${currentVersion}`);
  console.log(`Local commit: ${localCommit || 'Unable to check'}`);
  console.log(`Remote commit: ${remoteCommit || 'Unable to check'}`);

  if (!localCommit || !remoteCommit) {
    console.log('\n⚠ Not a git repository or cannot access remote repository.');
    console.log('  Update manually: git pull && npm run setup --force\n');
    process.exit(1);
  }

  if (localCommit === remoteCommit) {
    console.log('\n✅ Already up to date.\n');
    process.exit(0);
  }

  console.log('\n📦 New update available!');

  // Show what's new
  try {
    const log = exec(`git log ${localCommit}..origin/main --oneline`, { stdio: 'pipe' });
    if (log.trim()) {
      console.log('\nChangelog:');
      log.trim().split('\n').slice(0, 5).forEach(line => {
        console.log(`  - ${line}`);
      });
      const total = log.trim().split('\n').length;
      if (total > 5) {
        console.log(`  ... and ${total - 5} more commits`);
      }
    }
  } catch { }

  if (checkOnly) {
    console.log('\nTo update: npm run update\n');
    process.exit(0);
  }

  // Check for uncommitted changes
  if (hasUncommittedChanges()) {
    console.log('\n⚠ You have uncommitted changes.');
    console.log('  Please commit or stash your changes and try again.\n');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Starting update...\n');

  // 1. Git pull
  console.log('[1/4] Fetching latest code (git pull)...');
  try {
    exec('git pull origin main', { stdio: 'inherit' });
    console.log('      ✓ Done');
  } catch (error) {
    console.error('      ✗ Failed:', error.message);
    process.exit(1);
  }

  // 2. npm install
  console.log('[2/4] Updating dependencies (npm install)...');
  try {
    execSync('npm install', { cwd: rootDir, stdio: 'inherit' });
    console.log('      ✓ Done');
  } catch (error) {
    console.error('      ✗ Failed');
    process.exit(1);
  }

  // 3. Build
  console.log('[3/4] Building (npm run build)...');
  try {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
    console.log('      ✓ Done');
  } catch (error) {
    console.error('      ✗ Failed');
    process.exit(1);
  }

  // 4. Update hooks and skills
  console.log('[4/4] Updating Hooks & Skills...');

  // Update hooks (preserve user files like api_keys.json, logs, state)
  const srcHooksDir = path.join(rootDir, 'hooks');
  if (fs.existsSync(srcHooksDir)) {
    copyDirRecursive(srcHooksDir, claudeHooksDir, ['__pycache__', 'api_keys.json', 'logs', 'state', '.example', 'config.json']);
    console.log('      ✓ Hooks updated: ' + claudeHooksDir);
  }

  // Update skills
  const srcSkillsDir = path.join(rootDir, 'skills');
  if (fs.existsSync(srcSkillsDir)) {
    copyDirRecursive(srcSkillsDir, claudeSkillsDir);
    console.log('      ✓ Skills updated: ' + claudeSkillsDir);
  }

  // Done
  const newVersion = getCurrentVersion();
  console.log('\n' + '═'.repeat(60));
  console.log(`\n✅ CC Orchestrator updated to v${newVersion}!`);
  console.log('\n⚠️  Please restart Claude Code.\n');
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
