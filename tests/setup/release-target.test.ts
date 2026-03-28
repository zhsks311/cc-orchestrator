import { describe, expect, it } from 'vitest';
import {
  buildReleaseCommitLookupArgs,
  buildReleaseCommitRef,
  buildSetupCommand,
  buildCloneCommand,
  buildRemoteTagCheckCommand,
  buildUpgradeCommands,
  getMissingReleaseTagErrorMessage,
  getLatestVersionTagFromOutput,
  getLatestVersionTagFromRemoteRefsOutput,
  getReleaseTag,
  getLatestVersionTag,
  isReleaseCheckoutUpToDate,
  ensureTagPrefix,
  runFreshInstallWorkflow,
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

  it('selects the latest semver tag from git stdout', () => {
    const gitStdout = '\nnoise\nv0.2.6\nv0.2.8\nv0.2.8-rc.1\nv0.2.7\n';

    expect(getLatestVersionTagFromOutput(gitStdout)).toBe('v0.2.8');
  });

  it('selects the latest semver tag from remote refs output', () => {
    const remoteRefsOutput = [
      '1111111111111111111111111111111111111111\trefs/tags/v0.2.6',
      '2222222222222222222222222222222222222222\trefs/tags/v0.2.8',
      '3333333333333333333333333333333333333333\trefs/tags/not-a-release',
      '4444444444444444444444444444444444444444\trefs/tags/v0.2.8-rc.1',
      '5555555555555555555555555555555555555555\trefs/tags/v0.2.7',
    ].join('\n');

    expect(getLatestVersionTagFromRemoteRefsOutput(remoteRefsOutput)).toBe('v0.2.8');
  });

  it('uses peeled commit refs for annotated release tags', () => {
    expect(buildReleaseCommitRef('v0.2.8')).toBe('refs/tags/v0.2.8^{commit}');
  });

  it('builds argv-safe release commit lookup args', () => {
    expect(buildReleaseCommitLookupArgs('v0.2.8')).toEqual([
      'rev-parse',
      'refs/tags/v0.2.8^{commit}',
    ]);
  });

  it('treats matching release names as stale when commits differ', () => {
    expect(isReleaseCheckoutUpToDate('abc1234', 'def5678')).toBe(false);
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

  it('delegates post-checkout work to plain setup', () => {
    expect(buildSetupCommand()).toBe('npm run setup -- --yes');
  });
});

describe('fresh install workflow', () => {
  it('preflights the remote tag before removing an existing install directory', async () => {
    const calls: string[] = [];

    await runFreshInstallWorkflow({
      installDirExists: true,
      ensureRemoteReleaseTagExists: async () => {
        calls.push('preflight');
      },
      removeExistingInstallDir: () => {
        calls.push('remove');
      },
      cloneRelease: async () => {
        calls.push('clone');
      },
    });

    expect(calls).toEqual(['preflight', 'remove', 'clone']);
  });

  it('does not remove the install directory when remote tag preflight fails', async () => {
    const calls: string[] = [];
    const missingTagError = getMissingReleaseTagErrorMessage('v0.2.8');

    await expect(
      runFreshInstallWorkflow({
        installDirExists: true,
        ensureRemoteReleaseTagExists: async () => {
          calls.push('preflight');
          throw new Error(missingTagError);
        },
        removeExistingInstallDir: () => {
          calls.push('remove');
        },
        cloneRelease: async () => {
          calls.push('clone');
        },
      })
    ).rejects.toThrow(missingTagError);

    expect(calls).toEqual(['preflight']);
  });
});
