import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const publishWorkflowPath = new URL('../../.github/workflows/publish.yml', import.meta.url);
const publishWorkflow = readFileSync(publishWorkflowPath, 'utf8');

function getStepNames(workflow: string): string[] {
  return [...workflow.matchAll(/^\s+- name: (.+)$/gm)].map((match) => match[1]);
}

describe('publish workflow', () => {
  it('keeps release validation steps before Bump version', () => {
    const stepNames = getStepNames(publishWorkflow);
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
    expect(
      publishWorkflow
    ).toMatch(/- name: Setup Node\.js[\s\S]*?cache: 'npm'/);
  });
});
