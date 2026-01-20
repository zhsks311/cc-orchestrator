/**
 * IntentAnalyzer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntentAnalyzer } from './IntentAnalyzer.js';
import { AgentRole } from '../../types/index.js';

describe('IntentAnalyzer', () => {
  let analyzer: IntentAnalyzer;

  beforeEach(() => {
    analyzer = new IntentAnalyzer();
  });

  describe('Explicit @ mentions', () => {
    it('should detect @arch mention', async () => {
      const result = await analyzer.analyze('@arch review this code architecture');
      expect(result.decision.agent).toBe(AgentRole.ARCH);
      expect(result.decision.confidence).toBe('high');
      expect(result.decision.isExplicitMention).toBe(true);
    });

    it('should detect @canvas mention', async () => {
      const result = await analyzer.analyze('@canvas create button component');
      expect(result.decision.agent).toBe(AgentRole.CANVAS);
      expect(result.decision.confidence).toBe('high');
    });

    it('should detect @architect mention (alias)', async () => {
      const result = await analyzer.analyze('@architect review this code architecture');
      expect(result.decision.agent).toBe(AgentRole.ARCH);
      expect(result.decision.confidence).toBe('high');
    });

    it('should detect @quill mention', async () => {
      const result = await analyzer.analyze('@quill write documentation');
      expect(result.decision.agent).toBe(AgentRole.QUILL);
      expect(result.decision.confidence).toBe('high');
    });
  });

  describe('Parallel execution detection', () => {
    it('should detect @all mention', async () => {
      const result = await analyzer.analyze('@all analyze this project');
      expect(result.decision.isParallel).toBe(true);
      expect(result.decision.agent).toBeNull();
    });

    it('should detect "simultaneously" keyword', async () => {
      const result = await analyzer.analyze('process with all agents simultaneously');
      expect(result.decision.isParallel).toBe(true);
    });

    it('should detect "in parallel" keyword', async () => {
      const result = await analyzer.analyze('run in parallel please');
      expect(result.decision.isParallel).toBe(true);
    });
  });

  describe('Feedback request detection', () => {
    it('should detect "do it again" as retry_same', async () => {
      const result = await analyzer.analyze('do it again');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('retry_same');
    });

    it('should detect "retry" as retry_same', async () => {
      const result = await analyzer.analyze('retry please');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('retry_same');
    });

    it('should detect "different agent" as retry_different', async () => {
      const result = await analyzer.analyze('try with a different agent');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('retry_different');
    });

    it('should detect "modify it" as modify', async () => {
      const result = await analyzer.analyze('modify it please');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('modify');
    });

    it('should detect "more detail" as modify', async () => {
      const result = await analyzer.analyze('give me more detail');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('modify');
    });

    it('should NOT detect generic "update" as modify', async () => {
      const result = await analyzer.analyze('update the README file');
      expect(result.isFeedbackRequest).toBeFalsy();
    });

    it('should NOT detect "think about" as retry (not a retry phrase)', async () => {
      // Contains no retry keywords
      const result = await analyzer.analyze('think about this problem');
      expect(result.isFeedbackRequest).toBeFalsy();
    });

    it('should NOT detect "modify" in technical context', async () => {
      const result = await analyzer.analyze('modify the database schema');
      expect(result.isFeedbackRequest).toBeFalsy();
    });
  });

  describe('Heuristic analysis', () => {
    it('should suggest canvas for UI/component tasks', async () => {
      // "UI", "component" are in Canvas's expertise
      const result = await analyzer.analyze('create login page UI component');
      expect(result.decision.agent).toBe(AgentRole.CANVAS);
    });

    it('should suggest quill for documentation tasks', async () => {
      // "documentation", "README" are in Quill's expertise
      const result = await analyzer.analyze('write README documentation');
      expect(result.decision.agent).toBe(AgentRole.QUILL);
    });

    it('should suggest arch for architecture tasks', async () => {
      // "architecture", "design" are in Arch's expertise
      const result = await analyzer.analyze('review the system architecture design');
      expect(result.decision.agent).toBe(AgentRole.ARCH);
    });

    it('should return low confidence for ambiguous queries', async () => {
      const result = await analyzer.analyze('help me');
      expect(result.decision.confidence).toBe('low');
    });

    it('should return valid result structure for any query', async () => {
      const result = await analyzer.analyze('do something');
      expect(result.decision).toBeDefined();
      expect(result.decision.confidence).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(result.decision.confidence);
    });
  });

  describe('Natural language agent references', () => {
    it('should detect "architect" as arch mention', async () => {
      const result = await analyzer.analyze('ask the architect about this');
      expect(result.decision.agent).toBe(AgentRole.ARCH);
    });

    it('should detect "canvas" agent name in context', async () => {
      // Uses the natural language detection (not @ mention)
      const result = await analyzer.analyze('ask canvas to create this UI');
      expect(result.decision.agent).toBe(AgentRole.CANVAS);
    });

    it('should detect "quill" alias in natural language', async () => {
      const result = await analyzer.analyze('let quill write the documentation');
      expect(result.decision.agent).toBe(AgentRole.QUILL);
    });
  });
});
