import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { assertSupportedPublishMode } from '../../scripts/lib/publish-mode.js';

const publishScriptPath = fileURLToPath(new URL('../../scripts/publish.mjs', import.meta.url));
const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const { version: packageVersion } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  version: string;
};

describe('publish mode helper', () => {
  it('rejects real local publishes without a version bump', () => {
    expect(() =>
      assertSupportedPublishMode({
        version: packageVersion,
        dryRun: false,
        bumpType: undefined,
      })
    ).toThrow(packageVersion);
  });

  it('allows dry-run publishes without a version bump', () => {
    expect(() =>
      assertSupportedPublishMode({
        version: packageVersion,
        dryRun: true,
        bumpType: undefined,
      })
    ).not.toThrow();
  });

  it('allows real publishes when a version bump is requested', () => {
    expect(() =>
      assertSupportedPublishMode({
        version: packageVersion,
        dryRun: false,
        bumpType: 'patch',
      })
    ).not.toThrow();
  });
});

describe('publish script guard', () => {
  it('rejects tagless local publishes before prerequisites run', () => {
    const result = spawnSync(process.execPath, [publishScriptPath], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      `Refusing to publish v${packageVersion} from the local/manual fallback without a version bump.`
    );
    expect(result.stdout).toContain('GitHub Actions "Publish to npm" workflow_dispatch job');
    expect(result.stdout).toContain(`or run with --dry-run to preview v${packageVersion}.`);
    expect(result.stdout).not.toContain('Checking prerequisites...');
    expect(result.stderr).toBe('');
  });
});
