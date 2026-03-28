import { describe, expect, it } from 'vitest';
import {
  buildCloneCommand,
  buildRemoteTagCheckCommand,
  buildUpgradeCommands,
  getReleaseTag,
  getLatestVersionTag,
  ensureTagPrefix,
} from '../../installer/lib/release-target.js';

describe('release-target helpers', () => {
  it('maps installer version to release tag', () => {
    expect(getReleaseTag('0.2.8')).toBe('v0.2.8');
  });

  it('preserves an existing v-prefixed tag', () => {
    expect(ensureTagPrefix('v0.2.8')).toBe('v0.2.8');
  });

  it('selects the latest semver tag from git output', () => {
    const gitTagList = ['noise', 'v0.2.6', 'v0.2.8', 'v0.2.7', 'v0.2.8-rc.1'];
    expect(getLatestVersionTag(gitTagList)).toBe('v0.2.8');
  });

  it('returns null when no version tags exist', () => {
    expect(getLatestVersionTag([])).toBeNull();
  });
});

describe('tag-aware installer commands', () => {
  it('clones a specific release tag', () => {
    expect(
      buildCloneCommand('https://github.com/zhsks311/cc-orchestrator.git', '/tmp/cco', 'v0.2.8')
    ).toBe(
      'git clone --branch v0.2.8 --depth 1 https://github.com/zhsks311/cc-orchestrator.git "/tmp/cco"'
    );
  });

  it('checks for a specific release tag on the remote', () => {
    expect(
      buildRemoteTagCheckCommand('https://github.com/zhsks311/cc-orchestrator.git', 'v0.2.8')
    ).toBe(
      'git ls-remote --exit-code --tags https://github.com/zhsks311/cc-orchestrator.git refs/tags/v0.2.8'
    );
  });

  it('upgrades an existing install to the requested tag', () => {
    expect(buildUpgradeCommands('v0.2.8')).toEqual([
      'git fetch --tags origin',
      'git rev-parse -q --verify refs/tags/v0.2.8',
      'git checkout --force v0.2.8',
      'git reset --hard v0.2.8',
    ]);
  });
});
