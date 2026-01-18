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

const REPO_URL = 'https://github.com/zhsks311/cc-orchestrator.git';
const DEFAULT_INSTALL_DIR = path.join(os.homedir(), '.cc-orchestrator');

// Parse arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const upgradeMode = args.includes('--upgrade') || args.includes('-u');
const forceMode = args.includes('--force') || args.includes('-f');

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
  --help, -h       Show this help message

Examples:
  npx cc-orchestrator@latest                    # Install to ~/.cc-orchestrator
  npx cc-orchestrator@latest ./my-cco           # Install to custom directory
  npx cc-orchestrator@latest --upgrade          # Update existing installation
  npx cc-orchestrator@latest --force            # Force reinstall

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

  // Check if directory exists
  if (fs.existsSync(installDir)) {
    if (upgradeMode) {
      console.log('📦 Existing installation found - upgrade mode\n');
    } else {
      const answer = await question('⚠️  Already installed. Overwrite? (y/N): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('\nInstallation cancelled.');
        console.log('To upgrade: npx cc-orchestrator@latest --upgrade\n');
        process.exit(0);
      }
    }
  }

  // Step 1: Clone or pull
  console.log('─'.repeat(50));
  if (fs.existsSync(path.join(installDir, '.git'))) {
    console.log('\n[1/3] Fetching latest code...\n');
    // Use fetch + reset to handle local changes (e.g., package-lock.json from npm install)
    exec('git fetch origin main', { cwd: installDir });
    exec('git reset --hard origin/main', { cwd: installDir });
  } else {
    console.log('\n[1/3] Cloning repository...\n');
    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
    }
    exec(`git clone ${REPO_URL} "${installDir}"`);
  }

  // Step 2: npm install
  console.log('\n[2/3] Installing dependencies...\n');
  exec('npm install', { cwd: installDir });

  // Step 3: Run setup
  console.log('\n[3/3] Running setup wizard...\n');
  console.log('─'.repeat(50));

  const setupArgs = forceMode ? ['run', 'setup', '--', '--force'] : ['run', 'setup'];
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
