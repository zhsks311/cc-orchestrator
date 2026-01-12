#!/usr/bin/env node
/**
 * CC Orchestrator CLI
 *
 * One-line installer and updater for CC Orchestrator
 *
 * Usage:
 *   npx cc-orchestrator              # Install or update
 *   npx cc-orchestrator --help       # Show help
 *   npx cc-orchestrator --version    # Show version
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_URL = 'https://github.com/zhsks311/cc-orchestrator.git';
const DEFAULT_INSTALL_DIR = path.join(os.homedir(), '.cc-orchestrator');

// Parse arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const showVersion = args.includes('--version') || args.includes('-v');
const forceMode = args.includes('--force') || args.includes('-f');

// Get custom directory from args (first non-flag arg)
const customDir = args.find(arg => !arg.startsWith('-'));

function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function printBanner() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║       CC Orchestrator                                      ║
║                                                            ║
║   Multi-model orchestration for Claude Code                ║
║   GPT-5.2 | Gemini 3 Pro | Claude Sonnet 4.5               ║
╚════════════════════════════════════════════════════════════╝
`);
}

function printHelp() {
  printBanner();
  console.log(`Usage:
  npx cc-orchestrator [directory] [options]

Commands:
  (default)        Install or update CC Orchestrator

Options:
  --force, -f      Force reinstall all components
  --version, -v    Show version
  --help, -h       Show this help message

Examples:
  npx cc-orchestrator                    # Install to ~/.cc-orchestrator
  npx cc-orchestrator ./my-cco           # Install to custom directory
  npx cc-orchestrator --force            # Force reinstall

After installation:
  1. Restart Claude Code
  2. Try: "oracle한테 프로젝트 리뷰해달라고 해"

Update (after installation):
  cd ~/.cc-orchestrator && npm run update
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

function isInstalled(installDir) {
  return fs.existsSync(path.join(installDir, 'package.json')) &&
         fs.existsSync(path.join(installDir, '.git'));
}

async function install(installDir) {
  const alreadyInstalled = isInstalled(installDir);

  if (alreadyInstalled) {
    console.log(`📁 기존 설치 발견: ${installDir}\n`);
    console.log('업데이트를 진행합니다...\n');
    console.log('─'.repeat(50));

    // Update mode
    console.log('\n[1/2] 최신 코드 가져오기...\n');
    exec('git pull origin main', { cwd: installDir });

    console.log('\n[2/2] 설정 업데이트...\n');
    const setupArgs = forceMode ? ['run', 'setup', '--', '--force'] : ['run', 'setup'];
    await spawnAsync('npm', setupArgs, { cwd: installDir });

  } else {
    console.log(`📁 설치 경로: ${installDir}\n`);

    // Check if directory exists but is not a valid installation
    if (fs.existsSync(installDir)) {
      const answer = await question('⚠️  디렉토리가 이미 존재합니다. 덮어쓰시겠습니까? (y/N): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('\n설치가 취소되었습니다.\n');
        process.exit(0);
      }
      fs.rmSync(installDir, { recursive: true, force: true });
    }

    console.log('─'.repeat(50));

    // Fresh install
    console.log('\n[1/3] 저장소 복제 중...\n');
    exec(`git clone ${REPO_URL} "${installDir}"`);

    console.log('\n[2/3] 의존성 설치 중...\n');
    exec('npm install', { cwd: installDir });

    console.log('\n[3/3] 설정 마법사 실행...\n');
    console.log('─'.repeat(50));

    const setupArgs = forceMode ? ['run', 'setup', '--', '--force'] : ['run', 'setup'];
    await spawnAsync('npm', setupArgs, { cwd: installDir });
  }

  // Done
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  ✅ CC Orchestrator 설치/업데이트 완료!                     ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  다음 단계:                                                 ║
║  1. Claude Code를 재시작하세요                              ║
║  2. 다음과 같이 사용해보세요:                               ║
║     "oracle한테 이 프로젝트 리뷰해달라고 해"                ║
║                                                            ║
║  업데이트:                                                  ║
║     npx cc-orchestrator                                    ║
║     또는: cd ${installDir} && npm run update
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
}

async function main() {
  if (showVersion) {
    console.log(`cc-orchestrator v${getVersion()}`);
    process.exit(0);
  }

  if (showHelp) {
    printHelp();
    process.exit(0);
  }

  printBanner();

  // Check prerequisites
  console.log('사전 요구사항 확인...\n');

  const hasGit = checkCommand('git');
  const hasNode = checkCommand('node');
  const hasNpm = checkCommand('npm');

  console.log(`  Git:  ${hasGit ? '✓' : '✗'}`);
  console.log(`  Node: ${hasNode ? '✓' : '✗'}`);
  console.log(`  npm:  ${hasNpm ? '✓' : '✗'}`);

  if (!hasGit || !hasNode || !hasNpm) {
    console.log('\n❌ 필수 도구가 설치되지 않았습니다.');
    if (!hasGit) console.log('   - Git을 설치하세요: https://git-scm.com/');
    if (!hasNode) console.log('   - Node.js를 설치하세요: https://nodejs.org/');
    process.exit(1);
  }

  // Determine install directory
  const installDir = customDir
    ? path.resolve(customDir)
    : DEFAULT_INSTALL_DIR;

  await install(installDir);
}

main().catch((error) => {
  console.error('\n❌ 오류 발생:', error.message);
  process.exit(1);
});
