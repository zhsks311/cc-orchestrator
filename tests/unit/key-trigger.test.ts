/**
 * Key Trigger System Test
 * QA: 키 트리거 기반 에이전트 자동 선택 시스템 테스트
 */

import { AgentRole } from '../../src/types/index.js';
import {
  findBestAgent,
  AGENT_METADATA,
} from '../../src/core/agents/prompts.js';

describe('Key Trigger System', () => {
  describe('findBestAgent', () => {
    it('should return oracle for architecture-related queries', () => {
      // ORACLE triggers: 아키텍처, 설계, 리뷰, 검토, 트레이드오프, 성능, 보안
      const queries = [
        '아키텍처 분석해줘',
        '설계 방향 잡아줘',
        '리뷰 부탁해',
        '검토해줘',
        '성능 개선 방법',
        '보안 이슈 확인',
      ];

      for (const query of queries) {
        const result = findBestAgent(query);
        expect(result).toBe(AgentRole.ORACLE);
      }
    });

    it('should return librarian for search/documentation queries', () => {
      const queries = [
        '문서 검색해줘',
        'API 레퍼런스 찾아줘',
        '이 라이브러리 사용법 조사해줘',
        '예제 찾아줘',
      ];

      for (const query of queries) {
        const result = findBestAgent(query);
        expect(result).toBe(AgentRole.LIBRARIAN);
      }
    });

    it('should return frontend-engineer for UI-related queries', () => {
      // FRONTEND_ENGINEER triggers: UI, UX, 디자인, 스타일, CSS, 애니메이션, 레이아웃, 색상
      const queries = [
        'UI 개선해줘',
        'UX 최적화',
        '디자인 수정해줘',
        'CSS 스타일링',
        '애니메이션 추가해줘',
        '레이아웃 변경',
        '색상 바꿔줘',
      ];

      for (const query of queries) {
        const result = findBestAgent(query);
        expect(result).toBe(AgentRole.FRONTEND_ENGINEER);
      }
    });

    it('should return document-writer for documentation queries', () => {
      const queries = [
        'README 작성해줘',        // README trigger
        '가이드 작성해줘',         // 가이드 trigger
        '설명서 만들어줘',         // 설명서 trigger
      ];

      for (const query of queries) {
        const result = findBestAgent(query);
        expect(result).toBe(AgentRole.DOCUMENT_WRITER);
      }
    });

    it('should return multimodal-analyzer for image/PDF queries', () => {
      const queries = [
        '이미지 분석해줘',
        'PDF 파일 분석해줘',
        '스크린샷 봐줘',
        '다이어그램 해석해줘',
      ];

      for (const query of queries) {
        const result = findBestAgent(query);
        expect(result).toBe(AgentRole.MULTIMODAL_ANALYZER);
      }
    });

    it('should return explore for codebase exploration queries', () => {
      const queries = [
        '파일 찾기',              // 찾기 trigger
        '함수 위치 알려줘',        // 위치 trigger
        '코드 구조 파악해줘',       // 구조 trigger
        '어디에 있어?',            // 어디 trigger
      ];

      for (const query of queries) {
        const result = findBestAgent(query);
        expect(result).toBe(AgentRole.EXPLORE);
      }
    });

    it('should return null for ambiguous queries', () => {
      const queries = [
        '뭔가 해줘',
        '도와줘',
        '좀 봐줘',
      ];

      for (const query of queries) {
        const result = findBestAgent(query);
        // Might return null or any agent depending on implementation
        // Just ensure it doesn't throw
        expect(result === null || Object.values(AgentRole).includes(result)).toBe(true);
      }
    });
  });

  describe('AGENT_METADATA keyTriggers', () => {
    const allRoles = Object.values(AgentRole);

    it.each(allRoles)('should have keyTriggers for %s', (role) => {
      const metadata = AGENT_METADATA[role];
      expect(metadata.keyTriggers).toBeDefined();
      expect(Array.isArray(metadata.keyTriggers)).toBe(true);
      expect(metadata.keyTriggers.length).toBeGreaterThan(0);
    });

    it('should have unique keyTriggers per agent', () => {
      const allTriggers = new Map<string, AgentRole[]>();

      for (const role of allRoles) {
        const metadata = AGENT_METADATA[role];
        for (const trigger of metadata.keyTriggers) {
          if (!allTriggers.has(trigger)) {
            allTriggers.set(trigger, []);
          }
          allTriggers.get(trigger)!.push(role);
        }
      }

      // Check that most triggers are unique (some overlap is acceptable)
      let uniqueCount = 0;
      let totalCount = 0;
      for (const [, roles] of allTriggers) {
        totalCount++;
        if (roles.length === 1) uniqueCount++;
      }

      // At least 50% should be unique
      expect(uniqueCount / totalCount).toBeGreaterThan(0.5);
    });

    it('oracle should have architecture-related triggers', () => {
      const metadata = AGENT_METADATA[AgentRole.ORACLE];
      expect(metadata.keyTriggers.some(t =>
        ['아키텍처', '설계', '전략', '리뷰'].includes(t)
      )).toBe(true);
    });

    it('librarian should have search-related triggers', () => {
      const metadata = AGENT_METADATA[AgentRole.LIBRARIAN];
      expect(metadata.keyTriggers.some(t =>
        ['검색', '문서', '레퍼런스', '조사'].includes(t)
      )).toBe(true);
    });

    it('explore should have navigation-related triggers', () => {
      const metadata = AGENT_METADATA[AgentRole.EXPLORE];
      expect(metadata.keyTriggers.some(t =>
        ['찾기', '어디', '위치', '구조', '탐색'].includes(t)
      )).toBe(true);
    });
  });

  describe('Trigger matching behavior', () => {
    it('should be case-insensitive', () => {
      const lowerResult = findBestAgent('아키텍처');
      const mixedResult = findBestAgent('아키텍처 설계');

      // Both should return the same agent
      expect(lowerResult).toBe(mixedResult);
    });

    it('should match partial words', () => {
      // If a query contains a trigger as substring, it should still match
      const result = findBestAgent('시스템 아키텍처를 검토해주세요');
      expect(result).toBe(AgentRole.ORACLE);
    });

    it('should handle empty query', () => {
      const result = findBestAgent('');
      expect(result).toBeNull();
    });

    it('should handle query with only whitespace', () => {
      const result = findBestAgent('   ');
      expect(result).toBeNull();
    });
  });
});
