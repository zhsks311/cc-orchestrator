#!/usr/bin/env node
/**
 * CC Orchestrator Update Script
 * Fetch and update to the latest released tag from the remote repository
 *
 * Usage:
 *   npm run update              # Run update
 *   npm run update -- --check   # Check for updates only
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  buildUpgradeCommands,
  getLatestVersionTagFromOutput,
  isReleaseCheckoutUpToDate,
} from '../installer/lib/release-target.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check') || args.includes('-c');

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

function getRemoteVersionTag() {
  try {
    exec('git fetch --tags origin', { stdio: 'pipe' });
    const tagOutput = exec("git tag --list 'v*' --sort=-version:refname", { stdio: 'pipe' });
    return getLatestVersionTagFromOutput(tagOutput);
  } catch {
    return null;
  }
}

function getCommitForRef(ref) {
  try {
    return exec(`git rev-parse ${ref}^{commit}`, { stdio: 'pipe' }).trim().slice(0, 7);
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
  const currentReleaseTag = `v${currentVersion}`;
  const localCommit = getLocalCommit();
  const remoteTag = getRemoteVersionTag();
  const remoteCommit = remoteTag ? getCommitForRef(remoteTag) : null;

  console.log(`Current version: ${currentReleaseTag}`);
  console.log(`Local commit: ${localCommit || 'Unable to check'}`);
  console.log(`Latest release: ${remoteTag || 'Unable to check'}`);
  console.log(`Release commit: ${remoteCommit || 'Unable to check'}`);

  if (!localCommit || !remoteTag || !remoteCommit) {
    console.log('\n⚠ Not a git repository or cannot resolve a published release tag.');
    console.log('  Update manually after checking remote tags, then run: npm run setup -- --force\n');
    process.exit(1);
  }

  if (isReleaseCheckoutUpToDate(localCommit, remoteCommit)) {
    console.log('\n✅ Already up to date.\n');
    process.exit(0);
  }

  console.log('\n📦 New update available!');

  try {
    const log = exec(`git log ${localCommit}..${remoteTag} --oneline`, { stdio: 'pipe' });
    if (log.trim()) {
      console.log('\nChangelog:');
      log
        .trim()
        .split('\n')
        .slice(0, 5)
        .forEach((line) => {
          console.log(`  - ${line}`);
        });
      const total = log.trim().split('\n').length;
      if (total > 5) {
        console.log(`  ... and ${total - 5} more commits`);
      }
    }
  } catch {}

  if (checkOnly) {
    console.log('\nTo update: npm run update\n');
    process.exit(0);
  }

  if (hasUncommittedChanges()) {
    console.log('\n⚠ You have uncommitted changes.');
    console.log('  Please commit or stash your changes and try again.\n');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Starting update...\n');

  console.log(`[1/3] Checking out latest release (${remoteTag})...`);
  try {
    for (const command of buildUpgradeCommands(remoteTag)) {
      exec(command, { stdio: 'inherit' });
    }
    console.log('      ✓ Done');
  } catch (error) {
    console.error('      ✗ Failed:', error.message);
    process.exit(1);
  }

  console.log('[2/3] Running setup (npm run setup -- --yes)...');
  try {
    execSync('npm run setup -- --yes', { cwd: rootDir, stdio: 'inherit' });
    console.log('      ✓ Done');
  } catch {
    console.error('      ✗ Failed');
    process.exit(1);
  }

  console.log('[3/3] Refreshing version info...');
  const newVersion = getCurrentVersion();
  console.log(`      ✓ Current version: v${newVersion}`);

  console.log('\n' + '═'.repeat(60));
  console.log(`\n✅ CC Orchestrator updated to v${newVersion}!`);
  console.log('\n⚠️  Please restart Claude Code.\n');
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
