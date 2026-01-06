/**
 * Dynamic Prompt Builder
 * Injects runtime context into agent prompts
 */

import * as nodefs from 'fs';
import * as path from 'path';
import { AgentRole } from '../../types/index.js';
import { getSystemPromptForRole, AGENT_METADATA } from '../agents/prompts.js';

export interface DynamicContext {
  workingDirectory?: string;
  projectType?: string;
  projectName?: string;
  relevantFiles?: string[];
  previousResults?: Record<string, unknown>;
  sessionId?: string;
  customContext?: Record<string, unknown>;
}

export interface BuildPromptParams {
  role: AgentRole;
  task: string;
  dynamicContext?: DynamicContext;
  includeMetadata?: boolean;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export class DynamicPromptBuilder {
  static build(params: BuildPromptParams): BuiltPrompt {
    const baseSystemPrompt = getSystemPromptForRole(params.role);
    const dynamicSystemAdditions = this.buildDynamicSystemAdditions(params);
    const userPrompt = this.buildUserPrompt(params);

    return {
      systemPrompt: baseSystemPrompt + dynamicSystemAdditions,
      userPrompt,
    };
  }

  static detectProjectType(workingDirectory: string): {
    type: string;
    name?: string;
    framework?: string;
  } {
    const result: { type: string; name?: string; framework?: string } = {
      type: 'unknown',
    };

    const packageJsonPath = path.join(workingDirectory, 'package.json');
    if (nodefs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(nodefs.readFileSync(packageJsonPath, 'utf8'));
        result.name = packageJson.name;
        result.type = 'nodejs';

        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        if (deps['next']) result.framework = 'Next.js';
        else if (deps['react']) result.framework = 'React';
        else if (deps['vue']) result.framework = 'Vue';
        else if (deps['@angular/core']) result.framework = 'Angular';
        else if (deps['express']) result.framework = 'Express';
      } catch {
        // Ignore parse errors
      }
    }

    if (nodefs.existsSync(path.join(workingDirectory, 'pyproject.toml'))) {
      result.type = 'python';
    }
    if (nodefs.existsSync(path.join(workingDirectory, 'Cargo.toml'))) {
      result.type = 'rust';
    }
    if (nodefs.existsSync(path.join(workingDirectory, 'go.mod'))) {
      result.type = 'go';
    }

    return result;
  }

  private static buildDynamicSystemAdditions(params: BuildPromptParams): string {
    const additions: string[] = [];
    const ctx = params.dynamicContext;

    if (!ctx) return '';

    if (ctx.workingDirectory) {
      const projectInfo = this.detectProjectType(ctx.workingDirectory);
      if (projectInfo.type !== 'unknown') {
        additions.push('');
        additions.push('## Current Project Context');
        additions.push(`- Project Type: ${projectInfo.type}`);
        if (projectInfo.name) additions.push(`- Project Name: ${projectInfo.name}`);
        if (projectInfo.framework) additions.push(`- Framework: ${projectInfo.framework}`);
        additions.push(`- Working Directory: ${ctx.workingDirectory}`);
      }
    }

    if (ctx.relevantFiles && ctx.relevantFiles.length > 0) {
      additions.push('');
      additions.push('## Relevant Files');
      ctx.relevantFiles.slice(0, 10).forEach((file) => {
        additions.push(`- ${file}`);
      });
    }

    if (params.includeMetadata) {
      const metadata = AGENT_METADATA[params.role];
      if (metadata) {
        additions.push('');
        additions.push('## Agent Metadata');
        additions.push(`- Cost Level: ${metadata.cost}`);
        additions.push(`- Best Used When: ${metadata.useWhen.join(', ')}`);
      }
    }

    return additions.join('\n');
  }

  private static buildUserPrompt(params: BuildPromptParams): string {
    const parts: string[] = [];
    const ctx = params.dynamicContext;

    if (ctx?.previousResults && Object.keys(ctx.previousResults).length > 0) {
      parts.push('## Previous Task Results');
      for (const [key, value] of Object.entries(ctx.previousResults)) {
        parts.push(`### ${key}`);
        parts.push('```json');
        parts.push(JSON.stringify(value, null, 2));
        parts.push('```');
      }
      parts.push('');
    }

    if (ctx?.customContext && Object.keys(ctx.customContext).length > 0) {
      parts.push('## Additional Context');
      parts.push('```json');
      parts.push(JSON.stringify(ctx.customContext, null, 2));
      parts.push('```');
      parts.push('');
    }

    parts.push('## Task');
    parts.push(params.task);

    return parts.join('\n');
  }

  static createContextFromEnvironment(options?: {
    sessionId?: string;
    sharedContext?: Record<string, unknown>;
  }): DynamicContext {
    const ctx: DynamicContext = {
      workingDirectory: process.cwd(),
      sessionId: options?.sessionId,
    };

    if (options?.sharedContext) {
      ctx.previousResults = options.sharedContext;
    }

    return ctx;
  }
}
