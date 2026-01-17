#!/usr/bin/env node
/**
 * CC Orchestrator Publish Script
 * Publishes package to npm registry
 *
 * Usage:
 *   npm run publish              # Publish current version
 *   npm run publish -- patch     # Bump patch version and publish
 *   npm run publish -- minor     # Bump minor version and publish
 *   npm run publish -- major     # Bump major version and publish
 *   npm run publish -- --dry-run # Preview without publishing
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bumpType = args.find(a => ['patch', 'minor', 'major'].includes(a));

function log(message, type = 'info') {
  const prefix = {
    info: '\x1b[36m[INFO]\x1b[0m',
    success: '\x1b[32m[OK]\x1b[0m',
    error: '\x1b[31m[ERROR]\x1b[0m',
    warn: '\x1b[33m[WARN]\x1b[0m',
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
  } catch (error) {
    if (options.ignoreError) return null;
    throw error;
  }
}

function checkPrerequisites() {
  log('Checking prerequisites...');

  // 1. Check npm login
  try {
    const whoami = exec('npm whoami', { silent: true, stdio: 'pipe' });
    log(`Logged in as: ${whoami.trim()}`, 'success');
  } catch {
    log('Not logged in to npm. Run: npm login', 'error');
    process.exit(1);
  }

  // 2. Check git status
  const gitStatus = exec('git status --porcelain', { silent: true, stdio: 'pipe' });
  if (gitStatus && gitStatus.trim()) {
    log('Working directory has uncommitted changes:', 'warn');
    console.log(gitStatus);
    if (!dryRun) {
      log('Commit or stash changes before publishing', 'error');
      process.exit(1);
    }
  } else {
    log('Git working directory is clean', 'success');
  }

  // 3. Check if on main branch
  const branch = exec('git branch --show-current', { silent: true, stdio: 'pipe' }).trim();
  if (branch !== 'main' && branch !== 'master') {
    log(`Current branch is '${branch}', not main/master`, 'warn');
  } else {
    log(`On branch: ${branch}`, 'success');
  }

  // 4. Check private flag
  if (packageJson.private) {
    log('package.json has "private": true - will be removed for publishing', 'warn');
  }
}

function runTests() {
  log('Running tests...');
  try {
    exec('npm test');
    log('All tests passed', 'success');
  } catch {
    log('Tests failed', 'error');
    process.exit(1);
  }
}

function runBuild() {
  log('Building project...');
  try {
    exec('npm run build');
    log('Build completed', 'success');
  } catch {
    log('Build failed', 'error');
    process.exit(1);
  }
}

function bumpVersion(type) {
  if (!type) return packageJson.version;

  log(`Bumping ${type} version...`);
  try {
    exec(`npm version ${type} --no-git-tag-version`, { silent: true, stdio: 'pipe' });
    const newPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    log(`Version bumped: ${packageJson.version} -> ${newPackageJson.version}`, 'success');
    return newPackageJson.version;
  } catch (error) {
    log(`Failed to bump version: ${error.message}`, 'error');
    process.exit(1);
  }
}

function preparePackageJson() {
  log('Preparing package.json for publish...');

  const publishPackageJson = { ...packageJson };

  // Remove private flag
  delete publishPackageJson.private;

  // Ensure required fields
  if (!publishPackageJson.name) {
    log('package.json missing "name" field', 'error');
    process.exit(1);
  }

  // Write modified package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(publishPackageJson, null, 2) + '\n');
  log('Removed "private" flag from package.json', 'success');

  return publishPackageJson;
}

function restorePackageJson() {
  // Restore original package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  log('Restored original package.json');
}

function publish() {
  log('Publishing to npm...');

  const publishCmd = dryRun ? 'npm publish --dry-run' : 'npm publish';

  try {
    exec(publishCmd);
    if (dryRun) {
      log('Dry run completed successfully', 'success');
    } else {
      log('Published successfully!', 'success');
    }
  } catch (error) {
    log(`Publish failed: ${error.message}`, 'error');
    throw error;
  }
}

function createGitTag(version) {
  if (dryRun) return;

  log(`Creating git tag v${version}...`);
  try {
    exec(`git add package.json`);
    exec(`git commit -m "chore: release v${version}"`);
    exec(`git tag -a v${version} -m "Release v${version}"`);
    log(`Created tag v${version}`, 'success');
    log('Push with: git push && git push --tags', 'info');
  } catch (error) {
    log(`Failed to create git tag: ${error.message}`, 'warn');
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  CC Orchestrator - Publish Script');
  console.log('='.repeat(60) + '\n');

  if (dryRun) {
    log('DRY RUN MODE - No actual publish will occur', 'warn');
    console.log('');
  }

  // Step 1: Check prerequisites
  checkPrerequisites();
  console.log('');

  // Step 2: Run tests
  runTests();
  console.log('');

  // Step 3: Build
  runBuild();
  console.log('');

  // Step 4: Bump version (if requested)
  let version = packageJson.version;
  if (bumpType) {
    version = bumpVersion(bumpType);
    console.log('');
  }

  // Step 5: Prepare and publish
  try {
    preparePackageJson();
    publish();
  } finally {
    restorePackageJson();
  }
  console.log('');

  // Step 6: Create git tag (if version was bumped)
  if (bumpType && !dryRun) {
    createGitTag(version);
  }

  // Done
  console.log('='.repeat(60));
  if (dryRun) {
    log(`Dry run complete for v${version}`, 'success');
  } else {
    log(`Successfully published v${version} to npm!`, 'success');
    console.log(`\nInstall with: npm install ${packageJson.name}`);
  }
  console.log('');
}

main().catch((error) => {
  log(`Unexpected error: ${error.message}`, 'error');
  restorePackageJson();
  process.exit(1);
});
