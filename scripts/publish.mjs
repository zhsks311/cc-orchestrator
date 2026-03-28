#!/usr/bin/env node
/**
 * CC Orchestrator Publish Script
 * Local/manual fallback for publishing the installer package to npm.
 *
 * Canonical release path:
 *   - GitHub Actions -> "Publish to npm" workflow_dispatch job
 *
 * This script exists for troubleshooting and dry-run work when you need to
 * reproduce the release flow locally.
 *
 * Behavior:
 *   - Runs tests and builds before publishing
 *   - Syncs version between root and installer package.json
 *   - Creates git tag and pushes to remote automatically
 *   - Creates GitHub Release with auto-generated notes
 *
 * Usage:
 *   npm run publish              # Publish current version
 *   npm run publish -- patch     # Bump patch version and publish
 *   npm run publish -- minor     # Bump minor version and publish
 *   npm run publish -- major     # Bump major version and publish
 *   npm run publish -- --dry-run # Preview without publishing
 *
 * Prerequisites:
 *   - npm login (authenticated to npm registry)
 *   - gh CLI (for GitHub Release creation)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const installerDir = path.join(rootDir, 'installer');

const packageJsonPath = path.join(installerDir, 'package.json');
const rootPackageJsonPath = path.join(rootDir, 'package.json');
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
      cwd: options.cwd || installerDir,
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

  // 2. Check git status (from root)
  const gitStatus = exec('git status --porcelain', { cwd: rootDir, silent: true, stdio: 'pipe' });
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

  // 3. Check if on main branch (from root)
  const branch = exec('git branch --show-current', { cwd: rootDir, silent: true, stdio: 'pipe' }).trim();
  if (branch !== 'main' && branch !== 'master') {
    log(`Current branch is '${branch}', not main/master`, 'warn');
  } else {
    log(`On branch: ${branch}`, 'success');
  }

}

function runTests() {
  log('Running tests...');
  try {
    exec('npm test', { cwd: rootDir });
    log('All tests passed', 'success');
  } catch {
    log('Tests failed', 'error');
    process.exit(1);
  }
}

function runBuild() {
  log('Building project...');
  try {
    exec('npm run build', { cwd: rootDir });
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
    // Bump installer/package.json
    exec(`npm version ${type} --no-git-tag-version`, { silent: true, stdio: 'pipe' });
    const newPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    // Sync version to root package.json
    const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
    rootPackageJson.version = newPackageJson.version;
    fs.writeFileSync(rootPackageJsonPath, JSON.stringify(rootPackageJson, null, 2) + '\n');

    log(`Version bumped: ${packageJson.version} -> ${newPackageJson.version}`, 'success');
    log(`Synced version to root package.json`, 'success');
    return newPackageJson.version;
  } catch (error) {
    log(`Failed to bump version: ${error.message}`, 'error');
    process.exit(1);
  }
}

function checkPackageJson() {
  if (!packageJson.name) {
    log('package.json missing "name" field', 'error');
    process.exit(1);
  }
}

function publish(version, tagPushed = false) {
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
    if (tagPushed) {
      log(`Publish failed after pushing tag v${version}`, 'error');
      log(
        `If needed, delete the tag with: git tag -d v${version} && git push --delete origin v${version}`,
        'info'
      );
      log('That removes the tag only; it does not undo any release commit already pushed.', 'info');
    }
    log(`Publish failed: ${error.message}`, 'error');
    throw error;
  }
}

function createGitTag(version) {
  if (dryRun) return;

  log(`Creating git tag v${version}...`);
  try {
    exec(`git add package.json installer/package.json`, { cwd: rootDir });
    exec(`git commit -m "chore: release v${version}"`, { cwd: rootDir });
    exec(`git tag -a v${version} -m "Release v${version}"`, { cwd: rootDir });
    log(`Created tag v${version}`, 'success');
  } catch (error) {
    log(`Failed to create git tag: ${error.message}`, 'warn');
    throw error;
  }
}

function pushToRemote(version) {
  if (dryRun) return;

  log('Pushing to remote...');
  try {
    exec('git push', { cwd: rootDir });
    exec('git push --tags', { cwd: rootDir });
    log(`Pushed v${version} to remote`, 'success');
  } catch (error) {
    log(`Failed to push: ${error.message}`, 'warn');
    log('Manual push required: git push && git push --tags', 'info');
    throw error;
  }
}

function createGitHubRelease(version) {
  if (dryRun) return;

  log(`Creating GitHub Release v${version}...`);
  try {
    // Check if gh CLI is available
    exec('gh --version', { cwd: rootDir, silent: true, stdio: 'pipe' });

    // Create release with auto-generated notes
    exec(
      `gh release create v${version} --title "v${version}" --generate-notes --latest`,
      { cwd: rootDir }
    );
    log(`GitHub Release v${version} created`, 'success');
  } catch (error) {
    if (error.message?.includes('gh')) {
      log('gh CLI not found. Install: https://cli.github.com/', 'warn');
    } else {
      log(`Failed to create GitHub Release: ${error.message}`, 'warn');
    }
    log('Manual release: gh release create v' + version + ' --generate-notes --latest', 'info');
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  CC Orchestrator - Publish Script');
  console.log('  Target: installer/ -> npm cc-orchestrator');
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

  // Step 5: Create git tag and push first (if version was bumped)
  if (bumpType && !dryRun) {
    createGitTag(version);
    console.log('');

    pushToRemote(version);
    console.log('');
  }

  // Step 6: Publish
  checkPackageJson();
  publish(version, bumpType && !dryRun);
  console.log('');

  // Step 7: Create GitHub Release
  if (bumpType && !dryRun) {
    createGitHubRelease(version);
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
  process.exit(1);
});
