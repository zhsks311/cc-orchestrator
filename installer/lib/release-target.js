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
