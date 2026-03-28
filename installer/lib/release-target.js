export function ensureTagPrefix(value) {
  return value.startsWith('v') ? value : `v${value}`;
}

export function getReleaseTag(version) {
  return ensureTagPrefix(version.trim());
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
