#!/usr/bin/env node
/**
 * CC Orchestrator Update Script
 * 원격 저장소에서 최신 버전을 가져와 업데이트
 *
 * Usage:
 *   npm run update              # 업데이트 실행
 *   npm run update -- --check   # 업데이트 가능 여부만 확인
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

  console.log(`현재 버전: v${currentVersion}`);
  console.log(`로컬 커밋: ${localCommit || '확인 불가'}`);
  console.log(`원격 커밋: ${remoteCommit || '확인 불가'}`);

  if (!localCommit || !remoteCommit) {
    console.log('\n⚠ Git 저장소가 아니거나 원격 저장소에 접근할 수 없습니다.');
    console.log('  수동으로 업데이트하세요: git pull && npm run setup --force\n');
    process.exit(1);
  }

  if (localCommit === remoteCommit) {
    console.log('\n✅ 이미 최신 버전입니다.\n');
    process.exit(0);
  }

  console.log('\n📦 새로운 업데이트가 있습니다!');

  // Show what's new
  try {
    const log = exec(`git log ${localCommit}..origin/main --oneline`, { stdio: 'pipe' });
    if (log.trim()) {
      console.log('\n변경 내역:');
      log.trim().split('\n').slice(0, 5).forEach(line => {
        console.log(`  - ${line}`);
      });
      const total = log.trim().split('\n').length;
      if (total > 5) {
        console.log(`  ... 외 ${total - 5}개 커밋`);
      }
    }
  } catch { }

  if (checkOnly) {
    console.log('\n업데이트하려면: npm run update\n');
    process.exit(0);
  }

  // Check for uncommitted changes
  if (hasUncommittedChanges()) {
    console.log('\n⚠ 커밋되지 않은 변경사항이 있습니다.');
    console.log('  변경사항을 커밋하거나 stash한 후 다시 시도하세요.\n');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('업데이트 시작...\n');

  // 1. Git pull
  console.log('[1/4] 최신 코드 가져오기 (git pull)...');
  try {
    exec('git pull origin main', { stdio: 'inherit' });
    console.log('      ✓ 완료');
  } catch (error) {
    console.error('      ✗ 실패:', error.message);
    process.exit(1);
  }

  // 2. npm install
  console.log('[2/4] 의존성 업데이트 (npm install)...');
  try {
    execSync('npm install', { cwd: rootDir, stdio: 'inherit' });
    console.log('      ✓ 완료');
  } catch (error) {
    console.error('      ✗ 실패');
    process.exit(1);
  }

  // 3. Build
  console.log('[3/4] 빌드 (npm run build)...');
  try {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
    console.log('      ✓ 완료');
  } catch (error) {
    console.error('      ✗ 실패');
    process.exit(1);
  }

  // 4. Update hooks and skills
  console.log('[4/4] Hooks & Skills 업데이트...');

  // Update hooks (preserve user files like api_keys.json, logs, state)
  const srcHooksDir = path.join(rootDir, 'hooks');
  if (fs.existsSync(srcHooksDir)) {
    copyDirRecursive(srcHooksDir, claudeHooksDir, ['__pycache__', 'api_keys.json', 'logs', 'state', '.example', 'config.json']);
    console.log('      ✓ Hooks 업데이트: ' + claudeHooksDir);
  }

  // Update skills
  const srcSkillsDir = path.join(rootDir, 'skills');
  if (fs.existsSync(srcSkillsDir)) {
    copyDirRecursive(srcSkillsDir, claudeSkillsDir);
    console.log('      ✓ Skills 업데이트: ' + claudeSkillsDir);
  }

  // Done
  const newVersion = getCurrentVersion();
  console.log('\n' + '═'.repeat(60));
  console.log(`\n✅ CC Orchestrator가 v${newVersion}으로 업데이트되었습니다!`);
  console.log('\n⚠️  Claude Code를 재시작하세요.\n');
}

main().catch((error) => {
  console.error('오류 발생:', error.message);
  process.exit(1);
});
