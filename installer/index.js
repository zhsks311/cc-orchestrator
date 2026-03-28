#!/usr/bin/env node
/**
 * cc-orchestrator
 *
 * One-line installer for CC Orchestrator
 *
 * Usage:
 *   npx cc-orchestrator@latest              # Install
 *   npx cc-orchestrator@latest --upgrade    # Update existing installation
 *   npx cc-orchestrator@latest --help       # Show help
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  buildCloneCommand,
  buildRemoteTagCheckCommand,
  getMissingReleaseTagErrorMessage,
  getReleaseTag,
  runExistingInstallUpgradeWorkflow,
  runFreshInstallWorkflow,
} from './lib/release-target.js';
import { classifyInstallTarget, resolveInstallTargetAction } from './lib/install-target.js';

const REPO_URL = 'https://github.com/zhsks311/cc-orchestrator.git';
const DEFAULT_INSTALL_DIR = path.join(os.homedir(), '.cc-orchestrator');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const installerPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const INSTALLER_VERSION = installerPackageJson.version;
const RELEASE_TAG = getReleaseTag(INSTALLER_VERSION);

// Parse arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const upgradeMode = args.includes('--upgrade') || args.includes('-u');
const forceMode = args.includes('--force') || args.includes('-f');
const keysMode = args.includes('--keys') || args.includes('-k');

// Get custom directory from args (first non-flag arg)
const customDir = args.find(arg => !arg.startsWith('-'));

function printBanner() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║       CC Orchestrator - Installer                          ║
║                                                            ║
║   Multi-model orchestration for Claude Code                ║
║   GPT-5.2 | Gemini 3 Pro | Claude Sonnet 4.5               ║
╚════════════════════════════════════════════════════════════╝
`);
}

function printHelp() {
  printBanner();
  console.log(`Usage:
  npx cc-orchestrator@latest [directory] [options]

Options:
  --upgrade, -u    Update existing installation
  --force, -f      Force reinstall all components
  --keys, -k       Reconfigure API keys only
  --help, -h       Show this help message

Examples:
  npx cc-orchestrator@latest                    # Install to ~/.cc-orchestrator
  npx cc-orchestrator@latest ./my-cco           # Install to custom directory
  npx cc-orchestrator@latest --upgrade          # Update existing installation
  npx cc-orchestrator@latest --force            # Force reinstall
  npx cc-orchestrator@latest --keys             # Reconfigure API keys

After installation:
  1. Restart Claude Code
  2. Try: "ask arch to review this project"
`);
}

function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function checkCommand(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function exec(cmd, options = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...options });
}

function ensureRemoteReleaseTagExists(releaseTag) {
  try {
    execSync(buildRemoteTagCheckCommand(REPO_URL, releaseTag), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error?.status === 2) {
      throw new Error(getMissingReleaseTagErrorMessage(releaseTag));
    }

    throw error;
  }
}

function readPackageJsonName(installDir) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(installDir, 'package.json'), 'utf8'));
    return typeof packageJson?.name === 'string' ? packageJson.name : null;
  } catch {
    return null;
  }
}

function readRemoteOriginUrl(installDir) {
  try {
    return execSync('git config --get remote.origin.url', {
      cwd: installDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function spawnAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true, ...options });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function install(installDir) {
  console.log(`\n📁 Install path: ${installDir}\n`);

  const installDirExists = fs.existsSync(installDir);
  const installTarget = classifyInstallTarget({
    installDirExists,
    gitDirExists: fs.existsSync(path.join(installDir, '.git')),
    remoteOriginUrl: installDirExists ? readRemoteOriginUrl(installDir) : null,
    packageJsonName: installDirExists ? readPackageJsonName(installDir) : null,
  });
  const installAction = resolveInstallTargetAction({ installTarget, upgradeMode });

  if (installDirExists) {
    if (installAction.action === 'upgrade_existing') {
      console.log('📦 Existing installation found - upgrade mode\n');
    } else if (installAction.confirmation === 'managed_overwrite') {
      const answer = await question('⚠️  Already installed. Overwrite? (y/N): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('\nInstallation cancelled.');
        console.log('To upgrade: npx cc-orchestrator@latest --upgrade\n');
        process.exit(0);
      }
    } else if (installAction.confirmation === 'explicit_delete') {
      const answer = await question(
        '⚠️  Existing directory is not managed by CC Orchestrator and will be deleted. Type DELETE to continue: '
      );
      if (answer !== 'DELETE') {
        console.log('\nInstallation cancelled.');
        console.log('To upgrade: npx cc-orchestrator@latest --upgrade\n');
        process.exit(0);
      }
    }
  }

  if (installAction.action === 'abort_foreign_git') {
    throw new Error(
      'This directory is a git repository that is not managed by CC Orchestrator. Refusing to delete it.'
    );
  }

  // Step 1: Clone or pull
  console.log('─'.repeat(50));
  if (installAction.action === 'upgrade_existing') {
    console.log(`\n[1/3] Checking out release ${RELEASE_TAG}...\n`);
    runExistingInstallUpgradeWorkflow({
      releaseTag: RELEASE_TAG,
      runCommand: (command) => {
        exec(command, { cwd: installDir });
      },
    });
  } else {
    console.log(`\n[1/3] Cloning release ${RELEASE_TAG}...\n`);
    await runFreshInstallWorkflow({
      installDirExists,
      ensureRemoteReleaseTagExists: () => ensureRemoteReleaseTagExists(RELEASE_TAG),
      removeExistingInstallDir: () => {
        fs.rmSync(installDir, { recursive: true, force: true });
      },
      cloneRelease: () => exec(buildCloneCommand(REPO_URL, installDir, RELEASE_TAG)),
    });
  }

  // Step 2: npm install
  console.log('\n[2/3] Installing dependencies...\n');
  exec('npm install', { cwd: installDir });

  // Step 3: Run setup
  console.log('\n[3/3] Running setup wizard...\n');
  console.log('─'.repeat(50));

  const setupArgs = ['run', 'setup', '--'];
  if (forceMode) setupArgs.push('--force');
  if (keysMode) setupArgs.push('--keys');
  await spawnAsync('npm', setupArgs, { cwd: installDir });

  // Done
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  ✅ CC Orchestrator Installation Complete!                 ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Next steps:                                               ║
║  1. Restart Claude Code                                    ║
║  2. Try using it:                                          ║
║     "ask arch to review this project"                      ║
║                                                            ║
║  Update:                                                   ║
║     cd ${installDir}
║     npm run update                                         ║
║                                                            ║
║  Or:                                                       ║
║     npx cc-orchestrator@latest --upgrade                   ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
}

async function main() {
  if (showHelp) {
    printHelp();
    process.exit(0);
  }

  printBanner();

  // Check prerequisites
  console.log('Checking prerequisites...\n');

  const hasGit = checkCommand('git');
  const hasNode = checkCommand('node');
  const hasNpm = checkCommand('npm');

  console.log(`  Git:  ${hasGit ? '✓' : '✗'}`);
  console.log(`  Node: ${hasNode ? '✓' : '✗'}`);
  console.log(`  npm:  ${hasNpm ? '✓' : '✗'}`);

  if (!hasGit || !hasNode || !hasNpm) {
    console.log('\n❌ Required tools not installed.');
    if (!hasGit) console.log('   - Install Git: https://git-scm.com/');
    if (!hasNode) console.log('   - Install Node.js: https://nodejs.org/');
    process.exit(1);
  }

  // Determine install directory
  const installDir = customDir
    ? path.resolve(customDir)
    : DEFAULT_INSTALL_DIR;

  await install(installDir);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
