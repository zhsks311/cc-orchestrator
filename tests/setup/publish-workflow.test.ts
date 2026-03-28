import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const publishWorkflowPath = new URL('../../.github/workflows/publish.yml', import.meta.url);
const publishWorkflow = readFileSync(publishWorkflowPath, 'utf8');

function extractPublishJobBlock(workflow: string): string {
  const lines = workflow.split('\n');
  const publishJobIndex = lines.findIndex((line) => line === '  publish:');

  if (publishJobIndex === -1) {
    throw new Error('publish job not found');
  }

  const blockLines: string[] = [];

  for (let index = publishJobIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^\s{2}[^\s].*:\s*$/.test(line)) {
      break;
    }

    blockLines.push(line);
  }

  return blockLines.join('\n');
}

function getStepNames(jobBlock: string): string[] {
  return [...jobBlock.matchAll(/^\s{6}- name: (.+)$/gm)].map((match) => match[1]);
}

function extractStepBlock(jobBlock: string, stepName: string): string {
  const lines = jobBlock.split('\n');
  const stepStartIndex = lines.findIndex((line) => line === `      - name: ${stepName}`);

  if (stepStartIndex === -1) {
    throw new Error(`${stepName} step not found`);
  }

  const blockLines = [lines[stepStartIndex]];

  for (let index = stepStartIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith('      - name: ')) {
      break;
    }

    blockLines.push(line);
  }

  return blockLines.join('\n');
}

describe('publish workflow', () => {
  it('keeps release validation steps before Bump version', () => {
    const publishJobBlock = extractPublishJobBlock(publishWorkflow);
    const stepNames = getStepNames(publishJobBlock);
    const validationSteps = [
      'Install dependencies',
      'Run ESLint',
      'Check formatting',
      'Run type check',
      'Run tests',
      'Build',
    ];

    validationSteps.forEach((step) => {
      expect(stepNames).toContain(step);
    });
    expect(stepNames).toContain('Bump version');

    const validationIndices = validationSteps.map((step) => stepNames.indexOf(step));
    const bumpVersionIndex = stepNames.indexOf('Bump version');

    expect(validationIndices.every((index) => index > -1)).toBe(true);
    expect(validationIndices).toEqual([...validationIndices].sort((a, b) => a - b));
    expect(bumpVersionIndex).toBeGreaterThan(validationIndices[validationIndices.length - 1]);
  });

  it('uses npm cache on the setup node step', () => {
    const publishJobBlock = extractPublishJobBlock(publishWorkflow);
    const setupNodeBlock = extractStepBlock(publishJobBlock, 'Setup Node.js');

    expect(setupNodeBlock).toContain("cache: 'npm'");
  });

  it('guards publish flow on main and preserves release cleanup guidance', () => {
    const publishJobBlock = extractPublishJobBlock(publishWorkflow);
    const stepNames = getStepNames(publishJobBlock);
    const branchGuardIndex = stepNames.indexOf('Fail if workflow is not running on main');
    const checkoutIndex = stepNames.indexOf('Checkout');
    const pushReleaseRefIndex = stepNames.indexOf('Commit and push release ref');
    const publishIndex = stepNames.indexOf('Publish installer to npm');
    const cleanupIndex = stepNames.indexOf('Explain post-push cleanup');
    const branchGuardBlock = extractStepBlock(
      publishJobBlock,
      'Fail if workflow is not running on main'
    );
    const pushReleaseRefBlock = extractStepBlock(publishJobBlock, 'Commit and push release ref');
    const cleanupBlock = extractStepBlock(publishJobBlock, 'Explain post-push cleanup');

    expect(branchGuardIndex).toBeGreaterThan(-1);
    expect(branchGuardBlock).toContain('GITHUB_REF');
    expect(branchGuardBlock).toContain('refs/heads/main');
    expect(branchGuardBlock).toContain('if [ "${GITHUB_REF}" != "refs/heads/main" ]; then');
    expect(branchGuardBlock).toContain('exit 1');
    expect(branchGuardIndex).toBe(0);
    expect(branchGuardIndex).toBeLessThan(checkoutIndex);
    expect(pushReleaseRefIndex).toBeGreaterThan(branchGuardIndex);
    expect(publishIndex).toBeGreaterThan(pushReleaseRefIndex);
    expect(cleanupIndex).toBeGreaterThan(publishIndex);

    expect(publishJobBlock).toContain('id: push_release_ref');
    expect(publishJobBlock).toContain('id: publish_to_npm');
    const lockfileLoopStart = pushReleaseRefBlock.indexOf(
      'for lockfile in package-lock.json npm-shrinkwrap.json installer/package-lock.json installer/npm-shrinkwrap.json; do'
    );
    const commitStart = pushReleaseRefBlock.indexOf(
      'git commit -m "chore: release v${{ steps.version.outputs.version }}"'
    );

    expect(lockfileLoopStart).toBeGreaterThan(-1);
    expect(commitStart).toBeGreaterThan(-1);
    expect(lockfileLoopStart).toBeLessThan(commitStart);
    expect(pushReleaseRefBlock).toContain('if ! git push --tags; then');
    expect(pushReleaseRefBlock).toContain(
      'for lockfile in package-lock.json npm-shrinkwrap.json installer/package-lock.json installer/npm-shrinkwrap.json; do'
    );
    expect(pushReleaseRefBlock).toContain('if [ -f "$lockfile" ]; then');
    expect(pushReleaseRefBlock).toContain('git add "$lockfile"');
    expect(pushReleaseRefBlock).toContain('done');
    expect(pushReleaseRefBlock).toContain(
      'git tag -d v${{ steps.version.outputs.version }} && git push --delete origin v${{ steps.version.outputs.version }}'
    );
    expect(pushReleaseRefBlock).toContain(
      'Before the next release, revert the pushed release commit or recover from the same version baseline.'
    );
    expect(cleanupBlock).toContain("steps.push_release_ref.outcome == 'success'");
    expect(cleanupBlock).toContain("steps.publish_to_npm.outcome == 'failure'");
    expect(cleanupBlock).toContain(
      'That removes the tag only; it does not undo any release commit already pushed.'
    );
    expect(cleanupBlock).toContain(
      'Before the next release, revert the pushed release commit or recover from the same version baseline.'
    );
  });
});
