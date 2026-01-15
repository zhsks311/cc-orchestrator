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
    it('should detect @oracle mention', async () => {
      const result = await analyzer.analyze('@oracle 이 코드 아키텍처 검토해줘');
      expect(result.decision.agent).toBe(AgentRole.ORACLE);
      expect(result.decision.confidence).toBe('high');
      expect(result.decision.isExplicitMention).toBe(true);
    });

    it('should detect @librarian mention', async () => {
      const result = await analyzer.analyze('@librarian API 문서 찾아줘');
      expect(result.decision.agent).toBe(AgentRole.LIBRARIAN);
      expect(result.decision.confidence).toBe('high');
    });

    it('should detect @frontend mention', async () => {
      const result = await analyzer.analyze('@frontend 버튼 컴포넌트 만들어줘');
      expect(result.decision.agent).toBe(AgentRole.FRONTEND_ENGINEER);
      expect(result.decision.confidence).toBe('high');
    });
  });

  describe('Parallel execution detection', () => {
    it('should detect @all mention', async () => {
      const result = await analyzer.analyze('@all 이 프로젝트 분석해줘');
      expect(result.decision.isParallel).toBe(true);
      expect(result.decision.agent).toBeNull();
    });

    it('should detect "동시에" keyword', async () => {
      const result = await analyzer.analyze('동시에 모든 에이전트로 처리해줘');
      expect(result.decision.isParallel).toBe(true);
    });

    it('should detect "in parallel" keyword', async () => {
      const result = await analyzer.analyze('run in parallel please');
      expect(result.decision.isParallel).toBe(true);
    });
  });

  describe('Feedback request detection', () => {
    it('should detect "다시 해줘" as retry_same', async () => {
      const result = await analyzer.analyze('다시 해줘');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('retry_same');
    });

    it('should detect "retry" as retry_same', async () => {
      const result = await analyzer.analyze('retry please');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('retry_same');
    });

    it('should detect "다른 에이전트로" as retry_different', async () => {
      const result = await analyzer.analyze('다른 에이전트로 해줘');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('retry_different');
    });

    it('should detect "수정해줘" as modify', async () => {
      const result = await analyzer.analyze('결과 수정해줘');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('modify');
    });

    it('should detect "더 자세히" as modify', async () => {
      const result = await analyzer.analyze('더 자세히 설명해줘');
      expect(result.isFeedbackRequest).toBe(true);
      expect(result.feedbackType).toBe('modify');
    });

    it('should NOT detect generic "update" as modify', async () => {
      const result = await analyzer.analyze('update the README file');
      expect(result.isFeedbackRequest).toBeFalsy();
    });
  });

  describe('Heuristic analysis', () => {
    it('should suggest librarian for API/library search', async () => {
      // "레퍼런스" is in Librarian's expertise
      const result = await analyzer.analyze('레퍼런스 찾아줘 API 사용법');
      expect(result.decision.agent).toBe(AgentRole.LIBRARIAN);
    });

    it('should suggest frontend-engineer for UI/component tasks', async () => {
      // "UI", "컴포넌트" are in frontend-engineer's expertise
      const result = await analyzer.analyze('로그인 페이지 UI 컴포넌트 만들어줘');
      expect(result.decision.agent).toBe(AgentRole.FRONTEND_ENGINEER);
    });

    it('should suggest document-writer for documentation tasks', async () => {
      // "문서", "README" are in document-writer's expertise
      const result = await analyzer.analyze('README 문서 작성해줘');
      expect(result.decision.agent).toBe(AgentRole.DOCUMENT_WRITER);
    });

    it('should return low confidence for ambiguous queries', async () => {
      const result = await analyzer.analyze('도와줘');
      expect(result.decision.confidence).toBe('low');
    });

    it('should return valid result structure for any query', async () => {
      const result = await analyzer.analyze('뭔가 해줘');
      expect(result.decision).toBeDefined();
      expect(result.decision.confidence).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(result.decision.confidence);
    });
  });

  describe('Natural language agent references', () => {
    it('should detect "오라클" as oracle mention', async () => {
      const result = await analyzer.analyze('오라클한테 물어봐');
      expect(result.decision.agent).toBe(AgentRole.ORACLE);
    });

    it('should detect agent name in Korean context', async () => {
      // Uses the natural language detection (not @ mention)
      const result = await analyzer.analyze('라이브러리안에게 검색 부탁해');
      expect(result.decision.agent).toBe(AgentRole.LIBRARIAN);
    });
  });
});
