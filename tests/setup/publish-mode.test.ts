import { describe, expect, it } from 'vitest';

import { assertSupportedPublishMode } from '../../scripts/lib/publish-mode.js';

describe('publish mode helper', () => {
  it('rejects real local publishes without a version bump', () => {
    expect(() =>
      assertSupportedPublishMode({
        version: '0.2.8',
        dryRun: false,
        bumpType: undefined,
      })
    ).toThrow('0.2.8');
  });

  it('allows dry-run publishes without a version bump', () => {
    expect(() =>
      assertSupportedPublishMode({
        version: '0.2.8',
        dryRun: true,
        bumpType: undefined,
      })
    ).not.toThrow();
  });

  it('allows real publishes when a version bump is requested', () => {
    expect(() =>
      assertSupportedPublishMode({
        version: '0.2.8',
        dryRun: false,
        bumpType: 'patch',
      })
    ).not.toThrow();
  });
});
