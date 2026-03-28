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

    if (/^  [^\s].*:\s*$/.test(line)) {
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
});
