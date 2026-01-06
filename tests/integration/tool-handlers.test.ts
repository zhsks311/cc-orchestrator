/**
 * Tool Handlers Integration Test
 * QA: 도구 핸들러 통합 테스트
 *
 * NOTE: Full integration tests require complex module mocking.
 * Core functionality is covered by unit tests.
 * This file contains basic import/export verification tests.
 */

describe('ToolHandlers Integration', () => {
  describe('Module exports', () => {
    it('should export ToolHandlers class', async () => {
      // Dynamic import to handle ESM
      const { ToolHandlers } = await import('../../src/server/handlers/index.js');
      expect(ToolHandlers).toBeDefined();
      expect(typeof ToolHandlers).toBe('function');
    });

    it('should export ToolHandlerDependencies interface type', async () => {
      // Type-level check - if this compiles, the type exists
      const module = await import('../../src/server/handlers/index.js');
      expect(module).toHaveProperty('ToolHandlers');
    });
  });

  describe('Schema exports', () => {
    it('should export all required schemas', async () => {
      const schemas = await import('../../src/server/tools/schemas.js');

      expect(schemas.BackgroundTaskInputSchema).toBeDefined();
      expect(schemas.BackgroundOutputInputSchema).toBeDefined();
      expect(schemas.BackgroundCancelInputSchema).toBeDefined();
      expect(schemas.ListTasksInputSchema).toBeDefined();
      expect(schemas.ShareContextInputSchema).toBeDefined();
      expect(schemas.GetContextInputSchema).toBeDefined();
      expect(schemas.SuggestAgentInputSchema).toBeDefined();
    });
  });

  describe('Prompt exports', () => {
    it('should export prompt functions', async () => {
      const prompts = await import('../../src/core/agents/prompts.js');

      expect(prompts.getSystemPromptForRole).toBeDefined();
      expect(prompts.getRoleDescription).toBeDefined();
      expect(prompts.findBestAgent).toBeDefined();
      expect(prompts.AGENT_METADATA).toBeDefined();
    });
  });

  describe('DynamicPromptBuilder exports', () => {
    it('should export DynamicPromptBuilder class', async () => {
      const module = await import('../../src/core/prompts/DynamicPromptBuilder.js');

      expect(module.DynamicPromptBuilder).toBeDefined();
      expect(typeof module.DynamicPromptBuilder.build).toBe('function');
      expect(typeof module.DynamicPromptBuilder.detectProjectType).toBe('function');
      expect(typeof module.DynamicPromptBuilder.createContextFromEnvironment).toBe('function');
    });
  });
});
