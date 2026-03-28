const MANAGED_REPO_SLUG = 'zhsks311/cc-orchestrator';
const MANAGED_PACKAGE_NAME = 'cc-orchestrator-server';

function stripGitSuffix(value) {
  return value.replace(/\.git$/i, '').replace(/\/+$/u, '');
}

function parseGitHubSlug(remoteOriginUrl) {
  if (typeof remoteOriginUrl !== 'string') {
    return null;
  }

  const trimmed = remoteOriginUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('git@github.com:')) {
    return stripGitSuffix(trimmed.slice('git@github.com:'.length));
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== 'github.com') {
      return null;
    }

    return stripGitSuffix(parsed.pathname.replace(/^\/+/u, ''));
  } catch {
    return null;
  }
}

export function isManagedInstallRemoteUrl(remoteOriginUrl) {
  return parseGitHubSlug(remoteOriginUrl) === MANAGED_REPO_SLUG;
}

export function classifyInstallTarget({
  installDirExists,
  gitDirExists = false,
  remoteOriginUrl,
  packageJsonName,
}) {
  if (!installDirExists) {
    return 'missing';
  }

  if (!gitDirExists) {
    return 'foreign_directory';
  }

  if (isManagedInstallRemoteUrl(remoteOriginUrl) && packageJsonName === MANAGED_PACKAGE_NAME) {
    return 'managed_install';
  }

  return 'foreign_git';
}
