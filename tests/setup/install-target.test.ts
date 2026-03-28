import { describe, expect, it } from 'vitest';
import {
  classifyInstallTarget,
  isManagedInstallRemoteUrl,
} from '../../installer/lib/install-target.js';

describe('install-target helpers', () => {
  it('classifies missing install directories', () => {
    expect(classifyInstallTarget({ installDirExists: false })).toBe('missing');
  });

  it('classifies existing non-git directories as foreign directories', () => {
    expect(
      classifyInstallTarget({
        installDirExists: true,
        gitDirExists: false,
      })
    ).toBe('foreign_directory');
  });

  it('classifies git directories with foreign metadata as foreign git', () => {
    expect(
      classifyInstallTarget({
        installDirExists: true,
        gitDirExists: true,
        remoteOriginUrl: 'https://github.com/other-owner/other-repo.git',
        packageJsonName: 'other-repo',
      })
    ).toBe('foreign_git');
  });

  it('classifies managed installs with https remotes', () => {
    expect(
      classifyInstallTarget({
        installDirExists: true,
        gitDirExists: true,
        remoteOriginUrl: 'https://github.com/zhsks311/cc-orchestrator.git',
        packageJsonName: 'cc-orchestrator-server',
      })
    ).toBe('managed_install');
  });

  it('classifies managed installs with ssh remotes', () => {
    expect(
      classifyInstallTarget({
        installDirExists: true,
        gitDirExists: true,
        remoteOriginUrl: 'git@github.com:zhsks311/cc-orchestrator.git',
        packageJsonName: 'cc-orchestrator-server',
      })
    ).toBe('managed_install');
  });

  it('rejects non-matching repo slugs', () => {
    expect(isManagedInstallRemoteUrl('git@github.com:other/cc-orchestrator.git')).toBe(false);
  });

  it('accepts matching repo slugs for https and ssh remotes', () => {
    expect(
      isManagedInstallRemoteUrl('https://github.com/zhsks311/cc-orchestrator.git')
    ).toBe(true);
    expect(isManagedInstallRemoteUrl('git@github.com:zhsks311/cc-orchestrator.git')).toBe(true);
    expect(
      isManagedInstallRemoteUrl('ssh://git@github.com/zhsks311/cc-orchestrator.git')
    ).toBe(true);
  });
});
