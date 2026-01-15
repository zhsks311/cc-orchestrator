/**
 * Intent-based Agent Router
 *
 * 휴리스틱 분석을 통해 사용자 요청의 의도를 분석하고 적절한 에이전트를 선택합니다.
 * Confidence 수준에 따라 자동 실행, 확인 요청, 또는 선택지 제공을 결정합니다.
 */

import { AgentRole } from '../../types/index.js';
import { Logger } from '../../infrastructure/Logger.js';
import {
  AGENT_METADATA,
  parseAgentMention,
  isParallelRequest,
  getRoleDescription,
} from '../agents/prompts.js';

// ─────────────────────────────────────────────────────────────────────────────
// 휴리스틱 점수 가중치 상수
// ─────────────────────────────────────────────────────────────────────────────
const SCORING_WEIGHTS = {
  /** 에이전트 이름/별칭 언급 시 가중치 */
  NAME_MENTION: 0.4,
  /** 전문 분야 키워드 매칭 시 가중치 */
  EXPERTISE_KEYWORD: 0.15,
  /** 사용 사례(useWhen) 매칭 시 가중치 */
  USE_CASE: 0.1,
  /** 예시 패턴 매칭 시 가중치 */
  EXAMPLE_MATCH: 0.2,
  /** 회피 사례 매칭 시 감점 */
  AVOID_CASE_PENALTY: -0.2,
} as const;

const CONFIDENCE_THRESHOLDS = {
  /** high confidence 최소 점수 */
  HIGH: 0.6,
  /** medium confidence 최소 점수 */
  MEDIUM: 0.3,
  /** 1, 2위 점수 차이가 이 값 미만이면 medium으로 하향 */
  SCORE_GAP_FOR_DOWNGRADE: 0.2,
  /** 대안으로 제시할 최소 점수 */
  MIN_ALTERNATIVE_SCORE: 0.1,
  /** 키워드 최소 길이 (너무 짧은 키워드 제외) */
  MIN_KEYWORD_LENGTH: 2,
  /** 예시 패턴 매칭에 필요한 최소 단어 수 */
  MIN_EXAMPLE_WORD_MATCHES: 2,
} as const;

/** 병렬 실행 시 기본 포함 에이전트 */
const DEFAULT_PARALLEL_AGENTS: readonly AgentRole[] = [
  AgentRole.ARCH,
  AgentRole.CANVAS,
  AgentRole.INDEX,
] as const;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface RoutingDecision {
  /** 선택된 에이전트 (null이면 선택 불가) */
  agent: AgentRole | null;

  /** 신뢰도 수준 */
  confidence: ConfidenceLevel;

  /** 선택 이유 */
  reason: string;

  /** 대안 에이전트들 (confidence가 medium/low일 때) */
  alternatives?: Array<{
    agent: AgentRole;
    reason: string;
  }>;

  /** 병렬 실행 요청 여부 */
  isParallel?: boolean;

  /** 명시적 멘션으로 선택됨 */
  isExplicitMention?: boolean;
}

export interface IntentAnalysisResult {
  /** 라우팅 결정 */
  decision: RoutingDecision;

  /** 사용자에게 확인이 필요한 경우의 메시지 */
  confirmationMessage?: string;

  /** 선택지 제공이 필요한 경우의 옵션들 */
  options?: Array<{
    agent: AgentRole;
    description: string;
    cost: string;
  }>;

  /** 피드백/재시도 요청인 경우 */
  isFeedbackRequest?: boolean;

  /** 피드백 유형 */
  feedbackType?: 'retry_same' | 'retry_different' | 'modify';
}

export interface IIntentAnalyzer {
  analyze(query: string): Promise<IntentAnalysisResult>;
}

export class IntentAnalyzer implements IIntentAnalyzer {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('IntentAnalyzer');
  }

  /**
   * 사용자 쿼리를 분석하여 라우팅 결정을 내립니다.
   */
  async analyze(query: string): Promise<IntentAnalysisResult> {
    this.logger.debug('Analyzing intent', { query });

    // 0. 피드백/재시도 요청 체크 (최우선)
    const feedbackResult = this.detectFeedbackRequest(query);
    if (feedbackResult) {
      this.logger.info('Feedback request detected', { type: feedbackResult.feedbackType });
      return feedbackResult;
    }

    // 1. 명시적 @ 멘션 체크
    const mentionedAgent = parseAgentMention(query);
    if (mentionedAgent) {
      this.logger.info('Explicit mention detected', { agent: mentionedAgent });
      return this.createHighConfidenceResult(mentionedAgent, '명시적 멘션', true);
    }

    // 2. 병렬 실행 요청 체크
    if (isParallelRequest(query)) {
      this.logger.info('Parallel request detected');
      return this.createParallelResult(query);
    }

    // 3. 휴리스틱 기반 의도 분석
    const heuristicDecision = await this.analyzeWithHeuristics(query);

    // 4. Confidence에 따른 결과 생성
    return this.createResultFromDecision(heuristicDecision);
  }

  /**
   * 피드백/재시도 요청 감지
   * "다시 해줘", "다른 에이전트로", "retry" 등을 감지
   */
  private detectFeedbackRequest(query: string): IntentAnalysisResult | null {
    const lowerQuery = query.toLowerCase();

    // 같은 에이전트로 재시도 패턴
    const retrySamePatterns = [
      '다시 해', '다시해', '재시도', '한번 더', '한번더',
      'retry', 'again', 'try again', '다시 시도',
      '똑같이', '같은 에이전트', '방금 에이전트',
    ];

    // 다른 에이전트로 재시도 패턴
    const retryDifferentPatterns = [
      '다른 에이전트', '다른에이전트', '다른 걸로', '다른걸로',
      '다른 모델', '다른모델', 'different agent', 'try another',
      '바꿔서', '교체', '다르게',
    ];

    // 수정 요청 패턴 (이전 결과 참조를 암시하는 패턴만)
    const modifyPatterns = [
      '수정해줘', '고쳐줘', '바꿔줘', '변경해줘',  // "줘" 포함으로 요청 명확화
      '조금 더', '좀 더', '덜', '더 자세히', '더 간단히',
      '결과 수정', '결과를 수정', '결과를 바꿔',  // 명시적 결과 참조
      'modify it', 'change it', 'adjust it',  // "it" 포함으로 이전 결과 참조
    ];

    // 패턴 매칭
    for (const pattern of retryDifferentPatterns) {
      if (lowerQuery.includes(pattern)) {
        return {
          decision: {
            agent: null,
            confidence: 'high',
            reason: '다른 에이전트로 재시도 요청',
          },
          isFeedbackRequest: true,
          feedbackType: 'retry_different',
          confirmationMessage: '다른 에이전트로 시도해 볼까요?',
          options: Object.entries(AGENT_METADATA).map(([role, meta]) => ({
            agent: role as AgentRole,
            description: getRoleDescription(role as AgentRole),
            cost: meta.cost,
          })),
        };
      }
    }

    for (const pattern of modifyPatterns) {
      if (lowerQuery.includes(pattern)) {
        return {
          decision: {
            agent: null,
            confidence: 'high',
            reason: '결과 수정 요청',
          },
          isFeedbackRequest: true,
          feedbackType: 'modify',
          confirmationMessage: '이전 결과를 어떻게 수정할까요?',
        };
      }
    }

    for (const pattern of retrySamePatterns) {
      if (lowerQuery.includes(pattern)) {
        return {
          decision: {
            agent: null,
            confidence: 'high',
            reason: '같은 에이전트로 재시도 요청',
          },
          isFeedbackRequest: true,
          feedbackType: 'retry_same',
          confirmationMessage: '같은 에이전트로 다시 시도할까요?',
        };
      }
    }

    return null;
  }

  /**
   * 휴리스틱 기반 의도 분석
   *
   * 향후 LLM 기반 분석으로 확장 가능하도록 async로 유지
   */
  private async analyzeWithHeuristics(query: string): Promise<RoutingDecision> {
    return this.heuristicAnalysis(query);
  }

  /**
   * 휴리스틱 기반 의도 분석 (LLM 호출 대신 사용)
   */
  private heuristicAnalysis(query: string): RoutingDecision {
    const lowerQuery = query.toLowerCase();
    const scores: Map<AgentRole, { score: number; reasons: string[] }> = new Map();

    // 각 에이전트에 대해 점수 계산
    for (const [role, metadata] of Object.entries(AGENT_METADATA)) {
      const agentRole = role as AgentRole;
      let score = 0;
      const reasons: string[] = [];

      // 1. 에이전트 이름/별칭 언급 체크 (자연어로)
      const namePatterns = [
        metadata.name.toLowerCase(),
        ...metadata.aliases.map((a) => a.toLowerCase()),
      ];
      for (const pattern of namePatterns) {
        // @ 없이도 이름 언급 감지 (예: "아키텍트한테 물어봐")
        if (lowerQuery.includes(pattern) && !lowerQuery.includes(`@${pattern}`)) {
          score += SCORING_WEIGHTS.NAME_MENTION;
          reasons.push(`에이전트 이름 언급: ${pattern}`);
          break;
        }
      }

      // 2. 전문 분야 키워드 매칭
      for (const expertise of metadata.expertise) {
        const keywords = expertise.toLowerCase().split(/[\/\s,]+/);
        for (const keyword of keywords) {
          if (keyword.length > CONFIDENCE_THRESHOLDS.MIN_KEYWORD_LENGTH && lowerQuery.includes(keyword)) {
            score += SCORING_WEIGHTS.EXPERTISE_KEYWORD;
            reasons.push(`전문 분야 키워드: ${keyword}`);
          }
        }
      }

      // 3. useWhen 패턴 매칭
      for (const useCase of metadata.useWhen) {
        const keywords = useCase.toLowerCase().split(/[\/\s,]+/);
        for (const keyword of keywords) {
          if (keyword.length > CONFIDENCE_THRESHOLDS.MIN_KEYWORD_LENGTH && lowerQuery.includes(keyword)) {
            score += SCORING_WEIGHTS.USE_CASE;
            reasons.push(`사용 사례 매칭: ${keyword}`);
          }
        }
      }

      // 4. 예시 패턴 매칭
      for (const example of metadata.examples) {
        if (example.shouldUse) {
          const exampleWords = example.input.toLowerCase().split(/\s+/);
          let matchCount = 0;
          for (const word of exampleWords) {
            if (word.length > CONFIDENCE_THRESHOLDS.MIN_KEYWORD_LENGTH && lowerQuery.includes(word)) {
              matchCount++;
            }
          }
          if (matchCount >= CONFIDENCE_THRESHOLDS.MIN_EXAMPLE_WORD_MATCHES) {
            score += SCORING_WEIGHTS.EXAMPLE_MATCH;
            reasons.push(`예시 패턴 매칭: ${example.input}`);
          }
        }
      }

      // 5. avoidWhen에 해당하면 감점
      for (const avoidCase of metadata.avoidWhen) {
        const keywords = avoidCase.toLowerCase().split(/[\/\s,]+/);
        for (const keyword of keywords) {
          if (keyword.length > CONFIDENCE_THRESHOLDS.MIN_KEYWORD_LENGTH && lowerQuery.includes(keyword)) {
            score += SCORING_WEIGHTS.AVOID_CASE_PENALTY;
            reasons.push(`회피 사례 매칭 (감점): ${keyword}`);
          }
        }
      }

      scores.set(agentRole, { score: Math.max(0, score), reasons });
    }

    // 점수 기준 정렬
    const sortedScores = Array.from(scores.entries()).sort((a, b) => b[1].score - a[1].score);

    // 에이전트가 없으면 low confidence 반환
    if (sortedScores.length === 0) {
      return {
        agent: null,
        confidence: 'low',
        reason: '사용 가능한 에이전트가 없습니다',
      };
    }

    const topEntry = sortedScores[0]!;  // 위에서 length 체크했으므로 안전
    const topAgentRole = topEntry[0];
    const topAgentData = topEntry[1];
    const secondEntry = sortedScores.length > 1 ? sortedScores[1] : null;

    // Confidence 결정
    let confidence: ConfidenceLevel;
    if (topAgentData.score >= CONFIDENCE_THRESHOLDS.HIGH) {
      confidence = 'high';
    } else if (topAgentData.score >= CONFIDENCE_THRESHOLDS.MEDIUM) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // 1, 2위 점수 차이가 작으면 medium으로 낮춤
    if (
      confidence === 'high' &&
      secondEntry &&
      topAgentData.score - secondEntry[1].score < CONFIDENCE_THRESHOLDS.SCORE_GAP_FOR_DOWNGRADE
    ) {
      confidence = 'medium';
    }

    this.logger.debug('Heuristic analysis result', {
      topAgent: topAgentRole,
      score: topAgentData.score,
      confidence,
      reasons: topAgentData.reasons,
    });

    // 결과 생성
    const topReason =
      topAgentData.reasons.length > 0 && topAgentData.reasons[0]
        ? topAgentData.reasons[0]
        : '의도를 명확히 파악하기 어렵습니다';

    const result: RoutingDecision = {
      agent: confidence === 'low' ? null : topAgentRole,
      confidence,
      reason: topReason,
    };

    // 대안 추가 (medium/low인 경우)
    if (confidence !== 'high' && secondEntry && secondEntry[1].score > CONFIDENCE_THRESHOLDS.MIN_ALTERNATIVE_SCORE) {
      const secondReasons = secondEntry[1].reasons;
      const secondReason =
        secondReasons.length > 0 && secondReasons[0]
          ? secondReasons[0]
          : '대안으로 고려 가능';

      result.alternatives = [
        {
          agent: secondEntry[0],
          reason: secondReason,
        },
      ];
    }

    return result;
  }

  /**
   * 높은 신뢰도 결과 생성 (명시적 멘션)
   */
  private createHighConfidenceResult(
    agent: AgentRole,
    reason: string,
    isExplicit: boolean = false
  ): IntentAnalysisResult {
    return {
      decision: {
        agent,
        confidence: 'high',
        reason,
        isExplicitMention: isExplicit,
      },
    };
  }

  /**
   * 병렬 실행 결과 생성
   */
  private createParallelResult(_query: string): IntentAnalysisResult {
    // 병렬 실행 시 기본 에이전트 사용 (상단 상수로 정의)
    return {
      decision: {
        agent: null, // 병렬 실행이므로 단일 에이전트 아님
        confidence: 'high',
        reason: '병렬 실행 요청',
        isParallel: true,
        alternatives: DEFAULT_PARALLEL_AGENTS.map((agent) => ({
          agent,
          reason: getRoleDescription(agent),
        })),
      },
    };
  }

  /**
   * LLM 결정으로부터 결과 생성
   */
  private createResultFromDecision(decision: RoutingDecision): IntentAnalysisResult {
    const result: IntentAnalysisResult = { decision };

    if (decision.confidence === 'medium' && decision.agent) {
      // 확인 메시지 생성
      const metadata = AGENT_METADATA[decision.agent];
      result.confirmationMessage = `${metadata.name}(${getRoleDescription(decision.agent)})이(가) 적합해 보이는데, 맞나요?`;

      // 대안 옵션 추가
      result.options = [
        {
          agent: decision.agent,
          description: getRoleDescription(decision.agent),
          cost: metadata.cost,
        },
      ];

      if (decision.alternatives) {
        for (const alt of decision.alternatives) {
          const altMeta = AGENT_METADATA[alt.agent];
          result.options.push({
            agent: alt.agent,
            description: getRoleDescription(alt.agent),
            cost: altMeta.cost,
          });
        }
      }
    } else if (decision.confidence === 'low') {
      // 선택지 제공
      result.confirmationMessage = '어떤 에이전트가 도와드릴까요?';
      result.options = Object.entries(AGENT_METADATA).map(([role, meta]) => ({
        agent: role as AgentRole,
        description: getRoleDescription(role as AgentRole),
        cost: meta.cost,
      }));
    }

    return result;
  }
}
