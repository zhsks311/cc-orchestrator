/**
 * Explore Agent Test
 * QA: explore 에이전트 테스트
 */

import { AgentRole, ROLE_MODEL_MAPPING, ModelProvider } from '../../src/types/index.js';
import {
  getSystemPromptForRole,
  getRoleDescription,
  AGENT_METADATA,
} from '../../src/core/agents/prompts.js';

describe('Explore Agent', () => {
  describe('AgentRole enum', () => {
    it('should have EXPLORE role defined', () => {
      expect(AgentRole.EXPLORE).toBeDefined();
      expect(AgentRole.EXPLORE).toBe('explore');
    });

    it('should have 6 agent roles in total', () => {
      const roles = Object.values(AgentRole);
      expect(roles.length).toBe(6);
      expect(roles).toContain('explore');
    });
  });

  describe('Model mapping', () => {
    it('should have model config for EXPLORE role', () => {
      const config = ROLE_MODEL_MAPPING[AgentRole.EXPLORE];
      expect(config).toBeDefined();
    });

    it('should use Anthropic provider for EXPLORE', () => {
      const config = ROLE_MODEL_MAPPING[AgentRole.EXPLORE];
      expect(config.provider).toBe(ModelProvider.ANTHROPIC);
    });

    it('should use Claude Sonnet model for EXPLORE', () => {
      const config = ROLE_MODEL_MAPPING[AgentRole.EXPLORE];
      expect(config.model).toContain('sonnet');
    });

    it('should have fallback model configured', () => {
      const config = ROLE_MODEL_MAPPING[AgentRole.EXPLORE];
      expect(config.fallbackModel).toBeDefined();
    });
  });

  describe('Prompt configuration', () => {
    it('should have system prompt for EXPLORE', () => {
      const prompt = getSystemPromptForRole(AgentRole.EXPLORE);
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(500);
    });

    it('should include exploration-related keywords in prompt', () => {
      const prompt = getSystemPromptForRole(AgentRole.EXPLORE);
      expect(prompt).toMatch(/탐색|구조|파일|검색/);
    });

    it('should have role description for EXPLORE', () => {
      const description = getRoleDescription(AgentRole.EXPLORE);
      expect(description).not.toBe('Unknown role');
      expect(description).toMatch(/탐색|검색|구조/);
    });
  });

  describe('Metadata configuration', () => {
    it('should have metadata for EXPLORE', () => {
      const metadata = AGENT_METADATA[AgentRole.EXPLORE];
      expect(metadata).toBeDefined();
    });

    it('should be marked as FREE cost', () => {
      const metadata = AGENT_METADATA[AgentRole.EXPLORE];
      expect(metadata.cost).toBe('FREE');
    });

    it('should have relevant keyTriggers', () => {
      const metadata = AGENT_METADATA[AgentRole.EXPLORE];
      expect(metadata.keyTriggers).toContain('찾기');
      expect(metadata.keyTriggers).toContain('구조');
      expect(metadata.keyTriggers).toContain('탐색');
    });

    it('should have appropriate useWhen cases', () => {
      const metadata = AGENT_METADATA[AgentRole.EXPLORE];
      expect(metadata.useWhen.length).toBeGreaterThan(0);
      expect(metadata.useWhen.some(u => u.includes('탐색') || u.includes('파일'))).toBe(true);
    });

    it('should have appropriate avoidWhen cases', () => {
      const metadata = AGENT_METADATA[AgentRole.EXPLORE];
      expect(metadata.avoidWhen.length).toBeGreaterThan(0);
    });
  });
});
