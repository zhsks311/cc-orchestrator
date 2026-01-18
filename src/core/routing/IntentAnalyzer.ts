/**
 * Intent-based Agent Router
 *
 * Analyzes user request intent through heuristic analysis and selects the appropriate agent.
 * Decides between auto-execution, confirmation request, or option presentation based on confidence level.
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
// Heuristic scoring weight constants
// ─────────────────────────────────────────────────────────────────────────────
const SCORING_WEIGHTS = {
  /** Weight for agent name/alias mention */
  NAME_MENTION: 0.4,
  /** Weight for expertise keyword matching */
  EXPERTISE_KEYWORD: 0.15,
  /** Weight for use case (useWhen) matching */
  USE_CASE: 0.1,
  /** Weight for example pattern matching */
  EXAMPLE_MATCH: 0.2,
  /** Penalty for avoid case matching */
  AVOID_CASE_PENALTY: -0.2,
} as const;

const CONFIDENCE_THRESHOLDS = {
  /** Minimum score for high confidence */
  HIGH: 0.6,
  /** Minimum score for medium confidence */
  MEDIUM: 0.3,
  /** Downgrade to medium if 1st-2nd score gap is less than this */
  SCORE_GAP_FOR_DOWNGRADE: 0.2,
  /** Minimum score to suggest as alternative */
  MIN_ALTERNATIVE_SCORE: 0.1,
  /** Minimum keyword length (exclude too short keywords) */
  MIN_KEYWORD_LENGTH: 2,
  /** Minimum word matches needed for example pattern */
  MIN_EXAMPLE_WORD_MATCHES: 2,
} as const;

/** Default agents for parallel execution */
const DEFAULT_PARALLEL_AGENTS: readonly AgentRole[] = [
  AgentRole.ARCH,
  AgentRole.CANVAS,
  AgentRole.INDEX,
] as const;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface RoutingDecision {
  /** Selected agent (null if unable to select) */
  agent: AgentRole | null;

  /** Confidence level */
  confidence: ConfidenceLevel;

  /** Reason for selection */
  reason: string;

  /** Alternative agents (when confidence is medium/low) */
  alternatives?: Array<{
    agent: AgentRole;
    reason: string;
  }>;

  /** Whether parallel execution is requested */
  isParallel?: boolean;

  /** Selected via explicit mention */
  isExplicitMention?: boolean;
}

export interface IntentAnalysisResult {
  /** Routing decision */
  decision: RoutingDecision;

  /** Message when user confirmation is needed */
  confirmationMessage?: string;

  /** Options when presenting choices */
  options?: Array<{
    agent: AgentRole;
    description: string;
    cost: string;
  }>;

  /** Whether this is a feedback/retry request */
  isFeedbackRequest?: boolean;

  /** Feedback type */
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
   * Analyzes user query and makes routing decision.
   */
  async analyze(query: string): Promise<IntentAnalysisResult> {
    this.logger.debug('Analyzing intent', { query });

    // 0. Check for feedback/retry request (highest priority)
    const feedbackResult = this.detectFeedbackRequest(query);
    if (feedbackResult) {
      this.logger.info('Feedback request detected', { type: feedbackResult.feedbackType });
      return feedbackResult;
    }

    // 1. Check for explicit @ mention
    const mentionedAgent = parseAgentMention(query);
    if (mentionedAgent) {
      this.logger.info('Explicit mention detected', { agent: mentionedAgent });
      return this.createHighConfidenceResult(mentionedAgent, 'Explicit mention', true);
    }

    // 2. Check for parallel execution request
    if (isParallelRequest(query)) {
      this.logger.info('Parallel request detected');
      return this.createParallelResult(query);
    }

    // 3. Heuristic-based intent analysis
    const heuristicDecision = await this.analyzeWithHeuristics(query);

    // 4. Generate result based on confidence
    return this.createResultFromDecision(heuristicDecision);
  }

  /**
   * Detect feedback/retry requests
   * Detects patterns like "do it again", "try another agent", "retry", etc.
   */
  private detectFeedbackRequest(query: string): IntentAnalysisResult | null {
    const lowerQuery = query.toLowerCase();

    // Retry with same agent patterns
    const retrySamePatterns = [
      'retry',
      'again',
      'try again',
      'one more time',
      'same agent',
      'same one',
      'do it again',
      'redo',
      'repeat',
    ];

    // Retry with different agent patterns
    const retryDifferentPatterns = [
      'different agent',
      'another agent',
      'try another',
      'different model',
      'switch agent',
      'change agent',
    ];

    // Modify request patterns (patterns implying reference to previous result)
    const modifyPatterns = [
      'modify it',
      'change it',
      'adjust it',
      'fix it',
      'more detail',
      'more details',
      'less detail',
      'simpler',
      'modify the result',
      'change the result',
      'update it',
    ];

    // Pattern matching
    for (const pattern of retryDifferentPatterns) {
      if (lowerQuery.includes(pattern)) {
        return {
          decision: {
            agent: null,
            confidence: 'high',
            reason: 'Retry with different agent requested',
          },
          isFeedbackRequest: true,
          feedbackType: 'retry_different',
          confirmationMessage: 'Would you like to try with a different agent?',
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
            reason: 'Result modification requested',
          },
          isFeedbackRequest: true,
          feedbackType: 'modify',
          confirmationMessage: 'How would you like to modify the previous result?',
        };
      }
    }

    for (const pattern of retrySamePatterns) {
      if (lowerQuery.includes(pattern)) {
        return {
          decision: {
            agent: null,
            confidence: 'high',
            reason: 'Retry with same agent requested',
          },
          isFeedbackRequest: true,
          feedbackType: 'retry_same',
          confirmationMessage: 'Would you like to retry with the same agent?',
        };
      }
    }

    return null;
  }

  /**
   * Heuristic-based intent analysis
   *
   * Kept as async for future extension to LLM-based analysis
   */
  private async analyzeWithHeuristics(query: string): Promise<RoutingDecision> {
    return this.heuristicAnalysis(query);
  }

  /**
   * Heuristic-based intent analysis (used instead of LLM call)
   */
  private heuristicAnalysis(query: string): RoutingDecision {
    const lowerQuery = query.toLowerCase();
    const scores: Map<AgentRole, { score: number; reasons: string[] }> = new Map();

    // Calculate score for each agent
    for (const [role, metadata] of Object.entries(AGENT_METADATA)) {
      const agentRole = role as AgentRole;
      let score = 0;
      const reasons: string[] = [];

      // 1. Check agent name/alias mention (natural language)
      const namePatterns = [
        metadata.name.toLowerCase(),
        ...metadata.aliases.map((a) => a.toLowerCase()),
      ];
      for (const pattern of namePatterns) {
        // Detect name mention without @ (e.g., "ask the architect")
        if (lowerQuery.includes(pattern) && !lowerQuery.includes(`@${pattern}`)) {
          score += SCORING_WEIGHTS.NAME_MENTION;
          reasons.push(`Agent name mentioned: ${pattern}`);
          break;
        }
      }

      // 2. Expertise keyword matching
      for (const expertise of metadata.expertise) {
        const keywords = expertise.toLowerCase().split(/[/\s,]+/);
        for (const keyword of keywords) {
          if (
            keyword.length > CONFIDENCE_THRESHOLDS.MIN_KEYWORD_LENGTH &&
            lowerQuery.includes(keyword)
          ) {
            score += SCORING_WEIGHTS.EXPERTISE_KEYWORD;
            reasons.push(`Expertise keyword: ${keyword}`);
          }
        }
      }

      // 3. useWhen pattern matching
      for (const useCase of metadata.useWhen) {
        const keywords = useCase.toLowerCase().split(/[/\s,]+/);
        for (const keyword of keywords) {
          if (
            keyword.length > CONFIDENCE_THRESHOLDS.MIN_KEYWORD_LENGTH &&
            lowerQuery.includes(keyword)
          ) {
            score += SCORING_WEIGHTS.USE_CASE;
            reasons.push(`Use case match: ${keyword}`);
          }
        }
      }

      // 4. Example pattern matching
      for (const example of metadata.examples) {
        if (example.shouldUse) {
          const exampleWords = example.input.toLowerCase().split(/\s+/);
          let matchCount = 0;
          for (const word of exampleWords) {
            if (
              word.length > CONFIDENCE_THRESHOLDS.MIN_KEYWORD_LENGTH &&
              lowerQuery.includes(word)
            ) {
              matchCount++;
            }
          }
          if (matchCount >= CONFIDENCE_THRESHOLDS.MIN_EXAMPLE_WORD_MATCHES) {
            score += SCORING_WEIGHTS.EXAMPLE_MATCH;
            reasons.push(`Example pattern match: ${example.input}`);
          }
        }
      }

      // 5. Deduct points if matches avoidWhen
      for (const avoidCase of metadata.avoidWhen) {
        const keywords = avoidCase.toLowerCase().split(/[/\s,]+/);
        for (const keyword of keywords) {
          if (
            keyword.length > CONFIDENCE_THRESHOLDS.MIN_KEYWORD_LENGTH &&
            lowerQuery.includes(keyword)
          ) {
            score += SCORING_WEIGHTS.AVOID_CASE_PENALTY;
            reasons.push(`Avoid case match (penalty): ${keyword}`);
          }
        }
      }

      scores.set(agentRole, { score: Math.max(0, score), reasons });
    }

    // Sort by score
    const sortedScores = Array.from(scores.entries()).sort((a, b) => b[1].score - a[1].score);

    // Return low confidence if no agents available
    if (sortedScores.length === 0) {
      return {
        agent: null,
        confidence: 'low',
        reason: 'No agents available',
      };
    }

    const topEntry = sortedScores[0]!; // Safe due to length check above
    const topAgentRole = topEntry[0];
    const topAgentData = topEntry[1];
    const secondEntry = sortedScores.length > 1 ? sortedScores[1] : null;

    // Determine confidence
    let confidence: ConfidenceLevel;
    if (topAgentData.score >= CONFIDENCE_THRESHOLDS.HIGH) {
      confidence = 'high';
    } else if (topAgentData.score >= CONFIDENCE_THRESHOLDS.MEDIUM) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Downgrade to medium if 1st-2nd score gap is small
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

    // Generate result
    const topReason =
      topAgentData.reasons.length > 0 && topAgentData.reasons[0]
        ? topAgentData.reasons[0]
        : 'Unable to clearly determine intent';

    const result: RoutingDecision = {
      agent: confidence === 'low' ? null : topAgentRole,
      confidence,
      reason: topReason,
    };

    // Add alternatives (for medium/low confidence)
    if (
      confidence !== 'high' &&
      secondEntry &&
      secondEntry[1].score > CONFIDENCE_THRESHOLDS.MIN_ALTERNATIVE_SCORE
    ) {
      const secondReasons = secondEntry[1].reasons;
      const secondReason =
        secondReasons.length > 0 && secondReasons[0]
          ? secondReasons[0]
          : 'Can be considered as alternative';

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
   * Create high confidence result (explicit mention)
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
   * Create parallel execution result
   */
  private createParallelResult(_query: string): IntentAnalysisResult {
    // Use default agents for parallel execution (defined in constants above)
    return {
      decision: {
        agent: null, // Not a single agent since parallel execution
        confidence: 'high',
        reason: 'Parallel execution requested',
        isParallel: true,
        alternatives: DEFAULT_PARALLEL_AGENTS.map((agent) => ({
          agent,
          reason: getRoleDescription(agent),
        })),
      },
    };
  }

  /**
   * Create result from LLM decision
   */
  private createResultFromDecision(decision: RoutingDecision): IntentAnalysisResult {
    const result: IntentAnalysisResult = { decision };

    if (decision.confidence === 'medium' && decision.agent) {
      // Generate confirmation message
      const metadata = AGENT_METADATA[decision.agent];
      result.confirmationMessage = `${metadata.name} (${getRoleDescription(decision.agent)}) seems appropriate. Is that correct?`;

      // Add alternative options
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
      // Provide options
      result.confirmationMessage = 'Which agent would you like to help you?';
      result.options = Object.entries(AGENT_METADATA).map(([role, meta]) => ({
        agent: role as AgentRole,
        description: getRoleDescription(role as AgentRole),
        cost: meta.cost,
      }));
    }

    return result;
  }
}
