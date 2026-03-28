import { describe, expect, it } from 'vitest';
import {
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
    const gitTagList = ['v0.2.8', 'v0.2.7', 'v0.2.6'];
    expect(getLatestVersionTag(gitTagList)).toBe('v0.2.8');
  });

  it('returns null when no version tags exist', () => {
    expect(getLatestVersionTag([])).toBeNull();
  });
});
