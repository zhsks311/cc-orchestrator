/**
 * Agent Prompts Test
 * QA: 에이전트 프롬프트 강화 테스트
 */

import { AgentRole } from '../../src/types/index.js';
import {
  getSystemPromptForRole,
  getRoleDescription,
  AGENT_METADATA,
  findBestAgent,
} from '../../src/core/agents/prompts.js';

describe('Agent Prompts', () => {
  describe('getSystemPromptForRole', () => {
    const allRoles = Object.values(AgentRole);

    it.each(allRoles)('should return a prompt for %s role', (role) => {
      const prompt = getSystemPromptForRole(role);
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should have substantial prompts (>400 chars)', () => {
      for (const role of allRoles) {
        const prompt = getSystemPromptForRole(role);
        expect(prompt.length).toBeGreaterThan(400);
      }
    });
  });

  describe('getRoleDescription', () => {
    const allRoles = Object.values(AgentRole);

    it.each(allRoles)('should return description for %s role', (role) => {
      const description = getRoleDescription(role);
      expect(description).toBeDefined();
      expect(typeof description).toBe('string');
      expect(description).not.toBe('Unknown role');
    });

    it('should return "Unknown role" for invalid role', () => {
      const description = getRoleDescription('invalid-role' as AgentRole);
      expect(description).toBe('Unknown role');
    });
  });

  describe('AGENT_METADATA', () => {
    const allRoles = Object.values(AgentRole);

    it.each(allRoles)('should have metadata for %s role', (role) => {
      const metadata = AGENT_METADATA[role];
      expect(metadata).toBeDefined();
      expect(metadata.role).toBe(role);
    });

    it.each(allRoles)('should have cost field for %s', (role) => {
      const metadata = AGENT_METADATA[role];
      expect(['FREE', 'CHEAP', 'MODERATE', 'EXPENSIVE']).toContain(metadata.cost);
    });

    it.each(allRoles)('should have useWhen array for %s', (role) => {
      const metadata = AGENT_METADATA[role];
      expect(Array.isArray(metadata.useWhen)).toBe(true);
      expect(metadata.useWhen.length).toBeGreaterThan(0);
    });

    it.each(allRoles)('should have avoidWhen array for %s', (role) => {
      const metadata = AGENT_METADATA[role];
      expect(Array.isArray(metadata.avoidWhen)).toBe(true);
      expect(metadata.avoidWhen.length).toBeGreaterThan(0);
    });

    it.each(allRoles)('should have keyTriggers array for %s', (role) => {
      const metadata = AGENT_METADATA[role];
      expect(Array.isArray(metadata.keyTriggers)).toBe(true);
      expect(metadata.keyTriggers.length).toBeGreaterThan(0);
    });
  });
});
