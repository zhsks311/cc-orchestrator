export function ensureTagPrefix(value) {
  return value.startsWith('v') ? value : `v${value}`;
}

export function getReleaseTag(version) {
  return ensureTagPrefix(version.trim());
}

export function buildCloneCommand(repoUrl, installDir, releaseTag) {
  return `git clone --branch ${releaseTag} --depth 1 ${repoUrl} "${installDir}"`;
}

export function buildRemoteTagCheckCommand(repoUrl, releaseTag) {
  return `git ls-remote --exit-code --tags ${repoUrl} refs/tags/${releaseTag}`;
}

export function getMissingReleaseTagErrorMessage(releaseTag) {
  return `Release tag ${releaseTag} is not available yet. Retry after the release publish finishes.`;
}

export async function runFreshInstallWorkflow({
  installDirExists,
  ensureRemoteReleaseTagExists,
  removeExistingInstallDir,
  cloneRelease,
}) {
  await ensureRemoteReleaseTagExists();

  if (installDirExists) {
    removeExistingInstallDir();
  }

  await cloneRelease();
}

export function buildUpgradeCommands(releaseTag) {
  return [
    'git fetch --tags origin',
    `git rev-parse -q --verify refs/tags/${releaseTag}`,
    `git checkout --force ${releaseTag}`,
    `git reset --hard ${releaseTag}`,
  ];
}

export function getLatestVersionTag(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return null;
  }

  return (
    [...tags]
      .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))[0] ?? null
  );
}

export function getLatestVersionTagFromOutput(output) {
  if (typeof output !== 'string') {
    return null;
  }

  return getLatestVersionTag(output.split('\n').map((line) => line.trim()).filter(Boolean));
}
