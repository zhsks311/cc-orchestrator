#!/usr/bin/env node
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

function mergeSettings(existing, template, hooksPath) {
  const normalizedPath = hooksPath.split(path.sep).join('/');
  const templateStr = JSON.stringify(template);
  const resolvedStr = templateStr.split('{{HOOKS_PATH}}').join(normalizedPath);
  const resolved = JSON.parse(resolvedStr);
  const merged = { ...existing };
  if (resolved.hooks) {
    merged.hooks = merged.hooks || {};
    for (const [event, hooks] of Object.entries(resolved.hooks)) {
      merged.hooks[event] = merged.hooks[event] || [];
      for (const newHook of hooks) {
        if (!merged.hooks[event].some(h => JSON.stringify(h.hooks) === JSON.stringify(newHook.hooks))) {
          merged.hooks[event].push(newHook);
        }
      }
    }
  }
  if (resolved.alwaysThinkingEnabled !== undefined) merged.alwaysThinkingEnabled = resolved.alwaysThinkingEnabled;
  return merged;
}

console.log('');
console.log('=== CCMO Extra Installation ===');
console.log('');

console.log('1. Installing Hooks...');
const srcHooksDir = path.join(rootDir, 'hooks');
if (fs.existsSync(srcHooksDir)) {
  copyDirRecursive(srcHooksDir, claudeHooksDir, ['__pycache__', 'api_keys.json', 'logs', 'state', '.example']);
  const apiKeysPath = path.join(claudeHooksDir, 'api_keys.json');
  if (!fs.existsSync(apiKeysPath)) {
    fs.writeFileSync(apiKeysPath, JSON.stringify({ GEMINI_API_KEY: '' }, null, 2));
  }
  fs.mkdirSync(path.join(claudeHooksDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(claudeHooksDir, 'state'), { recursive: true });
  console.log('   Done: ' + claudeHooksDir);
} else {
  console.log('   Skipped: hooks folder not found');
}

console.log('');
console.log('2. Installing Skills...');
const srcSkillsDir = path.join(rootDir, 'skills');
if (fs.existsSync(srcSkillsDir)) {
  copyDirRecursive(srcSkillsDir, claudeSkillsDir);
  console.log('   Done: ' + claudeSkillsDir);
} else {
  console.log('   Skipped: skills folder not found');
}

console.log('');
console.log('3. Updating Settings...');
const templatePath = path.join(rootDir, 'templates', 'settings.template.json');
if (fs.existsSync(templatePath)) {
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  let existing = {};
  if (fs.existsSync(claudeSettingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
      fs.copyFileSync(claudeSettingsPath, claudeSettingsPath + '.backup');
      console.log('   Backup created');
    } catch (e) { }
  }
  const merged = mergeSettings(existing, template, claudeHooksDir);
  fs.writeFileSync(claudeSettingsPath, JSON.stringify(merged, null, 2));
  console.log('   Done: ' + claudeSettingsPath);
} else {
  console.log('   Skipped: template not found');
}

console.log('');
console.log('4. Updating Claude Desktop Config...');
try {
  let cfg = { mcpServers: {} };
  if (fs.existsSync(claudeDesktopConfigPath)) {
    cfg = JSON.parse(fs.readFileSync(claudeDesktopConfigPath, 'utf8'));
    fs.copyFileSync(claudeDesktopConfigPath, claudeDesktopConfigPath + '.backup');
  }
  cfg.mcpServers = cfg.mcpServers || {};
  cfg.mcpServers.ccmo = {
    command: 'node',
    args: [path.join(rootDir, 'dist', 'index.js')],
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || ''
    }
  };
  fs.mkdirSync(path.dirname(claudeDesktopConfigPath), { recursive: true });
  fs.writeFileSync(claudeDesktopConfigPath, JSON.stringify(cfg, null, 2));
  console.log('   Done: ' + claudeDesktopConfigPath);
} catch (e) {
  console.log('   Failed: ' + e.message);
}

console.log('');
console.log('=== Installation Complete ===');
console.log('Restart Claude Code to apply changes.');
console.log('');