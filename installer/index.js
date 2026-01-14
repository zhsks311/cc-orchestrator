#!/usr/bin/env node
/**
 * cc-orch
 *
 * One-line installer for CC Orchestrator
 *
 * Usage:
 *   npx cc-orch              # Install
 *   npx cc-orch --upgrade    # Update existing installation
 *   npx cc-orch --help       # Show help
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
  npx cc-orch [directory] [options]

Options:
  --upgrade, -u    Update existing installation
  --force, -f      Force reinstall all components
  --help, -h       Show this help message

Examples:
  npx cc-orch                    # Install to ~/.cc-orchestrator
  npx cc-orch ./my-cco           # Install to custom directory
  npx cc-orch --upgrade          # Update existing installation
  npx cc-orch --force            # Force reinstall

After installation:
  1. Restart Claude Code
  2. Try: "oracle한테 프로젝트 리뷰해달라고 해"
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
  console.log(`\n📁 설치 경로: ${installDir}\n`);

  // Check if directory exists
  if (fs.existsSync(installDir)) {
    if (upgradeMode) {
      console.log('📦 기존 설치 발견 - 업그레이드 모드\n');
    } else {
      const answer = await question('⚠️  이미 설치되어 있습니다. 덮어쓰시겠습니까? (y/N): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('\n설치가 취소되었습니다.');
        console.log('업그레이드하려면: npx cc-orch --upgrade\n');
        process.exit(0);
      }
    }
  }

  // Step 1: Clone or pull
  console.log('─'.repeat(50));
  if (fs.existsSync(path.join(installDir, '.git'))) {
    console.log('\n[1/3] 최신 코드 가져오기...\n');
    exec('git pull origin main', { cwd: installDir });
  } else {
    console.log('\n[1/3] 저장소 복제 중...\n');
    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
    }
    exec(`git clone ${REPO_URL} "${installDir}"`);
  }

  // Step 2: npm install
  console.log('\n[2/3] 의존성 설치 중...\n');
  exec('npm install', { cwd: installDir });

  // Step 3: Run setup
  console.log('\n[3/3] 설정 마법사 실행...\n');
  console.log('─'.repeat(50));

  const setupArgs = forceMode ? ['run', 'setup', '--', '--force'] : ['run', 'setup'];
  await spawnAsync('npm', setupArgs, { cwd: installDir });

  // Done
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  ✅ CC Orchestrator 설치 완료!                              ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  다음 단계:                                                 ║
║  1. Claude Code를 재시작하세요                              ║
║  2. 다음과 같이 사용해보세요:                               ║
║     "oracle한테 이 프로젝트 리뷰해달라고 해"                ║
║                                                            ║
║  업데이트:                                                  ║
║     cd ${installDir}
║     npm run update                                         ║
║                                                            ║
║  또는:                                                      ║
║     npx cc-orch --upgrade                                  ║
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
