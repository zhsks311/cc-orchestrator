/**
 * Dynamic Prompt Builder Test
 * QA: 동적 프롬프트 생성 시스템 테스트
 */

import { AgentRole } from '../../src/types/index.js';
import {
  DynamicPromptBuilder,
  DynamicContext,
  BuildPromptParams,
} from '../../src/core/prompts/DynamicPromptBuilder.js';

// Mock fs module for testing
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

import * as fs from 'fs';

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

describe('DynamicPromptBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('build', () => {
    it('should return systemPrompt and userPrompt', () => {
      const params: BuildPromptParams = {
        role: AgentRole.ORACLE,
        task: 'Test task',
      };

      const result = DynamicPromptBuilder.build(params);

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userPrompt).toBe('string');
    });

    it('should include task in userPrompt', () => {
      const params: BuildPromptParams = {
        role: AgentRole.ORACLE,
        task: 'Analyze this architecture',
      };

      const result = DynamicPromptBuilder.build(params);

      expect(result.userPrompt).toContain('Analyze this architecture');
      expect(result.userPrompt).toContain('## Task');
    });

    it('should work for all agent roles', () => {
      const allRoles = Object.values(AgentRole);

      for (const role of allRoles) {
        const params: BuildPromptParams = {
          role,
          task: 'Test task',
        };

        const result = DynamicPromptBuilder.build(params);
        expect(result.systemPrompt.length).toBeGreaterThan(100);
        expect(result.userPrompt).toContain('Test task');
      }
    });
  });

  describe('build with dynamicContext', () => {
    it('should include project context when workingDirectory provided', () => {
      // Only return true for package.json, false for others
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).endsWith('package.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'test-project',
        dependencies: { react: '^18.0.0' },
      }));

      const params: BuildPromptParams = {
        role: AgentRole.FRONTEND_ENGINEER,
        task: 'Build a component',
        dynamicContext: {
          workingDirectory: '/test/project',
        },
      };

      const result = DynamicPromptBuilder.build(params);

      expect(result.systemPrompt).toContain('Project Type');
      expect(result.systemPrompt).toContain('nodejs');
    });

    it('should include relevant files in system prompt', () => {
      mockExistsSync.mockReturnValue(false);

      const params: BuildPromptParams = {
        role: AgentRole.ORACLE,
        task: 'Review code',
        dynamicContext: {
          relevantFiles: ['src/index.ts', 'src/utils.ts', 'package.json'],
        },
      };

      const result = DynamicPromptBuilder.build(params);

      expect(result.systemPrompt).toContain('## Relevant Files');
      expect(result.systemPrompt).toContain('src/index.ts');
      expect(result.systemPrompt).toContain('src/utils.ts');
    });

    it('should limit relevant files to 10', () => {
      mockExistsSync.mockReturnValue(false);

      const manyFiles = Array.from({ length: 20 }, (_, i) => `file${i}.ts`);
      const params: BuildPromptParams = {
        role: AgentRole.ORACLE,
        task: 'Review code',
        dynamicContext: {
          relevantFiles: manyFiles,
        },
      };

      const result = DynamicPromptBuilder.build(params);

      // Should contain first 10 files but not file10+
      expect(result.systemPrompt).toContain('file0.ts');
      expect(result.systemPrompt).toContain('file9.ts');
      expect(result.systemPrompt).not.toContain('file10.ts');
    });

    it('should include previous results in user prompt', () => {
      const params: BuildPromptParams = {
        role: AgentRole.ORACLE,
        task: 'Continue from previous',
        dynamicContext: {
          previousResults: {
            librarian_search: { found: ['file1.ts', 'file2.ts'] },
          },
        },
      };

      const result = DynamicPromptBuilder.build(params);

      expect(result.userPrompt).toContain('## Previous Task Results');
      expect(result.userPrompt).toContain('librarian_search');
      expect(result.userPrompt).toContain('file1.ts');
    });

    it('should include custom context in user prompt', () => {
      const params: BuildPromptParams = {
        role: AgentRole.ORACLE,
        task: 'Custom task',
        dynamicContext: {
          customContext: {
            priority: 'high',
            deadline: '2024-01-01',
          },
        },
      };

      const result = DynamicPromptBuilder.build(params);

      expect(result.userPrompt).toContain('## Additional Context');
      expect(result.userPrompt).toContain('priority');
      expect(result.userPrompt).toContain('high');
    });
  });

  describe('build with metadata', () => {
    it('should include agent metadata when includeMetadata is true', () => {
      mockExistsSync.mockReturnValue(false);

      const params: BuildPromptParams = {
        role: AgentRole.ORACLE,
        task: 'Test task',
        includeMetadata: true,
        dynamicContext: {
          // Need dynamicContext for metadata to be processed
          relevantFiles: ['src/index.ts'],
        },
      };

      const result = DynamicPromptBuilder.build(params);

      expect(result.systemPrompt).toContain('## Agent Metadata');
      expect(result.systemPrompt).toContain('Cost Level');
    });

    it('should not include metadata by default', () => {
      const params: BuildPromptParams = {
        role: AgentRole.ORACLE,
        task: 'Test task',
      };

      const result = DynamicPromptBuilder.build(params);

      expect(result.systemPrompt).not.toContain('## Agent Metadata');
    });
  });

  describe('detectProjectType', () => {
    it('should detect Node.js project from package.json', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('package.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'my-node-app',
      }));

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.type).toBe('nodejs');
      expect(result.name).toBe('my-node-app');
    });

    it('should detect React framework', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('package.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'react-app',
        dependencies: { react: '^18.0.0' },
      }));

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.type).toBe('nodejs');
      expect(result.framework).toBe('React');
    });

    it('should detect Next.js framework', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('package.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'next-app',
        dependencies: { next: '^13.0.0', react: '^18.0.0' },
      }));

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.framework).toBe('Next.js');
    });

    it('should detect Vue framework', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('package.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'vue-app',
        dependencies: { vue: '^3.0.0' },
      }));

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.framework).toBe('Vue');
    });

    it('should detect Angular framework', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('package.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'angular-app',
        dependencies: { '@angular/core': '^15.0.0' },
      }));

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.framework).toBe('Angular');
    });

    it('should detect Express framework', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('package.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'express-app',
        dependencies: { express: '^4.0.0' },
      }));

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.framework).toBe('Express');
    });

    it('should detect Python project from pyproject.toml', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('pyproject.toml');
      });

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.type).toBe('python');
    });

    it('should detect Rust project from Cargo.toml', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('Cargo.toml');
      });

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.type).toBe('rust');
    });

    it('should detect Go project from go.mod', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('go.mod');
      });

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.type).toBe('go');
    });

    it('should return unknown for unrecognized projects', () => {
      mockExistsSync.mockReturnValue(false);

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      expect(result.type).toBe('unknown');
    });

    it('should handle package.json parse errors gracefully', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        return String(path).includes('package.json');
      });
      mockReadFileSync.mockReturnValue('invalid json');

      const result = DynamicPromptBuilder.detectProjectType('/test/dir');

      // Should return nodejs type but no name/framework due to parse error
      expect(result.type).toBe('unknown');
    });
  });

  describe('createContextFromEnvironment', () => {
    it('should set workingDirectory to process.cwd()', () => {
      const result = DynamicPromptBuilder.createContextFromEnvironment();

      expect(result.workingDirectory).toBe(process.cwd());
    });

    it('should include sessionId when provided', () => {
      const result = DynamicPromptBuilder.createContextFromEnvironment({
        sessionId: 'test-session-123',
      });

      expect(result.sessionId).toBe('test-session-123');
    });

    it('should include sharedContext as previousResults', () => {
      const sharedContext = {
        previousAnalysis: { result: 'success' },
      };

      const result = DynamicPromptBuilder.createContextFromEnvironment({
        sharedContext,
      });

      expect(result.previousResults).toEqual(sharedContext);
    });

    it('should work with no options', () => {
      const result = DynamicPromptBuilder.createContextFromEnvironment();

      expect(result).toHaveProperty('workingDirectory');
      expect(result.sessionId).toBeUndefined();
      expect(result.previousResults).toBeUndefined();
    });
  });
});
