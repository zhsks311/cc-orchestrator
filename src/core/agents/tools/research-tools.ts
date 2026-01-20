/**
 * Research Tools for Arch Agent
 *
 * These tools enable the arch agent to gather information systematically
 * before making recommendations. Designed for deep, multi-phase research.
 */

import { ToolDefinition } from '../../../types/tool.js';

/**
 * Research phases that guide systematic investigation
 */
export enum ResearchPhase {
  /** Initial broad exploration to understand scope */
  BROAD_EXPLORATION = 'broad_exploration',
  /** Targeted investigation of specific areas */
  TARGETED_INVESTIGATION = 'targeted_investigation',
  /** Verify findings from multiple sources */
  MULTI_SOURCE_VERIFICATION = 'multi_source_verification',
  /** Compare different approaches/patterns */
  COMPARATIVE_ANALYSIS = 'comparative_analysis',
  /** Confirm information saturation (no new insights) */
  SATURATION_CHECK = 'saturation_check',
}

/**
 * Scout search types for different exploration strategies
 */
export enum ScoutSearchType {
  /** Find files by name patterns (glob) */
  FILES = 'files',
  /** Search code content (grep) */
  CODE_CONTENT = 'code_content',
  /** Understand directory/module structure */
  STRUCTURE = 'structure',
  /** Track imports, exports, dependencies */
  DEPENDENCIES = 'dependencies',
  /** Find function/class/interface definitions */
  DEFINITIONS = 'definitions',
  /** Find where something is used/called */
  REFERENCES = 'references',
  /** Trace execution flow */
  CALL_FLOW = 'call_flow',
}

/**
 * Index search sources for external research
 */
export enum IndexSearchSource {
  /** Official library/framework documentation */
  OFFICIAL_DOCS = 'official_docs',
  /** GitHub repositories and code examples */
  GITHUB = 'github',
  /** Stack Overflow discussions */
  STACKOVERFLOW = 'stackoverflow',
  /** Technical blog posts and articles */
  TECH_BLOGS = 'tech_blogs',
  /** Academic papers and research */
  ACADEMIC = 'academic',
  /** Security advisories and CVEs */
  SECURITY = 'security',
  /** Performance benchmarks */
  BENCHMARKS = 'benchmarks',
}

/**
 * Scout Tool Definition
 *
 * For exploring and understanding the local codebase.
 * Supports systematic, multi-phase investigation.
 */
export const SCOUT_TOOL: ToolDefinition = {
  name: 'scout_search',
  description: `Explore and understand the codebase through systematic investigation.

## When to Use
- Finding files, functions, classes, or code patterns
- Understanding project structure and architecture
- Tracing code flow and dependencies
- Locating where something is defined or used

## Research Strategy
Treat codebase exploration as fundamentally complex requiring sequential phases:

1. **Broad Exploration**: Start with wide searches to understand scope
   - Search for general patterns first
   - Identify key directories and entry points

2. **Targeted Investigation**: Drill into specific areas
   - Focus on files/functions identified in broad search
   - Examine implementation details

3. **Multi-Source Verification**: Cross-reference findings
   - Check multiple related files
   - Verify patterns are consistent

4. **Dependency Analysis**: Understand relationships
   - Track imports and exports
   - Map call hierarchies

## Best Practices
- Execute MULTIPLE searches before drawing conclusions
- Start broad, then narrow down
- Always verify findings in related files
- Don't assume - search to confirm`,

  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: `What to search for. Be specific but not overly narrow initially.

Examples:
- Broad: "authentication" (find all auth-related code)
- Targeted: "validateToken function" (specific function)
- Pattern: "async function handle*" (naming patterns)`,
      },

      search_type: {
        type: 'string',
        enum: Object.values(ScoutSearchType),
        description: `Type of search to perform:

- files: Find files by name/pattern (use for broad exploration)
- code_content: Search inside files (use for specific implementations)
- structure: Understand directory layout (use first for new codebases)
- dependencies: Track imports/requires (use for understanding relationships)
- definitions: Find where things are defined (use for API understanding)
- references: Find where things are used (use for impact analysis)
- call_flow: Trace execution paths (use for debugging/understanding)`,
      },

      research_phase: {
        type: 'string',
        enum: Object.values(ResearchPhase),
        description: `Current phase of investigation. Helps track progress:

- broad_exploration: Initial wide search (DO THIS FIRST)
- targeted_investigation: Focused deep-dive
- multi_source_verification: Cross-checking findings
- comparative_analysis: Comparing approaches
- saturation_check: Confirming no new info needed`,
      },

      scope: {
        type: 'object',
        description: 'Limit search scope for efficiency',
        properties: {
          directories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific directories to search (e.g., ["src/auth", "src/middleware"])',
          },
          file_patterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'File patterns to include (e.g., ["*.ts", "*.tsx"])',
          },
          exclude: {
            type: 'array',
            items: { type: 'string' },
            description: 'Patterns to exclude (e.g., ["node_modules", "*.test.ts"])',
          },
        },
      },

      context: {
        type: 'object',
        description: 'Additional context to improve search accuracy',
        properties: {
          related_to: {
            type: 'string',
            description: 'Related concept or previous finding (helps narrow results)',
          },
          looking_for: {
            type: 'string',
            description: 'What you expect to find (helps interpret results)',
          },
          previous_findings: {
            type: 'array',
            items: { type: 'string' },
            description: 'Key files/patterns already discovered (avoids redundancy)',
          },
        },
      },

      depth: {
        type: 'string',
        enum: ['shallow', 'normal', 'deep', 'exhaustive'],
        description: `How thorough the search should be:

- shallow: Quick scan, first matches only (for initial exploration)
- normal: Standard search depth (default)
- deep: Thorough search including related files
- exhaustive: Leave no stone unturned (for critical decisions)`,
      },
    },
    required: ['query', 'search_type'],
  },
};

/**
 * Index Tool Definition
 *
 * For researching external documentation, best practices, and patterns.
 * Supports systematic, evidence-based research.
 */
export const INDEX_TOOL: ToolDefinition = {
  name: 'index_search',
  description: `Research external documentation, best practices, and implementation patterns.

## When to Use
- Learning how to use a library or framework
- Finding best practices and design patterns
- Researching security considerations
- Comparing different approaches or technologies
- Understanding API behavior and edge cases

## Research Strategy
Treat external research as fundamentally complex requiring multiple sources:

1. **Official Sources First**: Start with official documentation
   - Most accurate and up-to-date
   - Authoritative source of truth

2. **Community Validation**: Check community discussions
   - Real-world usage patterns
   - Common pitfalls and solutions

3. **Code Examples**: Find actual implementations
   - GitHub repositories
   - Working code samples

4. **Comparative Analysis**: When choosing approaches
   - Compare multiple options
   - Consider trade-offs

## Best Practices
- NEVER rely on a single source
- Verify information across multiple sources
- Prefer recent sources (check dates)
- Consider context (your use case may differ)
- Look for security implications`,

  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: `What to research. Be specific about technology and context.

Examples:
- "JWT refresh token rotation best practices Node.js"
- "React useEffect cleanup memory leak prevention"
- "PostgreSQL connection pooling production settings"
- "TypeScript discriminated union error handling patterns"`,
      },

      sources: {
        type: 'array',
        items: {
          type: 'string',
          enum: Object.values(IndexSearchSource),
        },
        description: `Which sources to search (searches all if not specified):

- official_docs: Official documentation (START HERE)
- github: Code repositories and examples
- stackoverflow: Community Q&A
- tech_blogs: Technical articles
- academic: Research papers
- security: Security advisories
- benchmarks: Performance comparisons`,
      },

      research_phase: {
        type: 'string',
        enum: Object.values(ResearchPhase),
        description: `Current phase of investigation:

- broad_exploration: Survey the landscape
- targeted_investigation: Deep-dive specific topics
- multi_source_verification: Cross-check facts
- comparative_analysis: Compare options
- saturation_check: Confirm completeness`,
      },

      technology_context: {
        type: 'object',
        description: 'Technology stack context for more relevant results',
        properties: {
          language: {
            type: 'string',
            description: 'Programming language (e.g., "TypeScript", "Python")',
          },
          framework: {
            type: 'string',
            description: 'Framework if applicable (e.g., "Express", "React", "FastAPI")',
          },
          version: {
            type: 'string',
            description: 'Version constraints (e.g., "Node.js 18+", "React 18")',
          },
          environment: {
            type: 'string',
            enum: ['development', 'production', 'testing'],
            description: 'Target environment',
          },
        },
      },

      comparison: {
        type: 'object',
        description: 'For comparative research between options',
        properties: {
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Options to compare (e.g., ["JWT", "Session cookies", "OAuth"])',
          },
          criteria: {
            type: 'array',
            items: { type: 'string' },
            description: 'Comparison criteria (e.g., ["security", "scalability", "complexity"])',
          },
        },
      },

      constraints: {
        type: 'object',
        description: 'Constraints that affect recommendations',
        properties: {
          must_have: {
            type: 'array',
            items: { type: 'string' },
            description: 'Required features/characteristics',
          },
          must_avoid: {
            type: 'array',
            items: { type: 'string' },
            description: 'Things to avoid (security issues, deprecated patterns)',
          },
          preferences: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nice-to-have features',
          },
        },
      },

      recency: {
        type: 'string',
        enum: ['latest', 'last_year', 'last_2_years', 'any'],
        description: `How recent the information should be:

- latest: Only very recent (for fast-moving tech)
- last_year: Within the last year (default)
- last_2_years: Slightly older is OK
- any: Historical context is valuable`,
      },
    },
    required: ['query'],
  },
};

/**
 * All research tools available to the arch agent
 */
export const RESEARCH_TOOLS: ToolDefinition[] = [SCOUT_TOOL, INDEX_TOOL];

/**
 * Research strategy guidance for the arch agent's system prompt
 */
export const RESEARCH_STRATEGY_PROMPT = `
## Research Tools Available

You have access to powerful research tools. Use them SYSTEMATICALLY.

### Core Principle
Treat every investigation as fundamentally complex requiring sequential multi-phase research:
1. Initial broad exploration
2. Targeted investigation
3. Multi-source verification
4. Comparative analysis
5. Information saturation confirmation

### Minimum Research Standard
Execute AT LEAST 5-10 distinct search iterations with deep analytical reasoning
before synthesizing your comprehensive response. More complex tasks require more searches.

### Tool Usage Pattern

**scout_search** - For codebase exploration
\`\`\`
Phase 1: scout_search(query="auth", search_type="structure", research_phase="broad_exploration")
Phase 2: scout_search(query="validateToken", search_type="definitions", research_phase="targeted_investigation")
Phase 3: scout_search(query="validateToken", search_type="references", research_phase="multi_source_verification")
\`\`\`

**index_search** - For external research
\`\`\`
Phase 1: index_search(query="JWT best practices", sources=["official_docs"], research_phase="broad_exploration")
Phase 2: index_search(query="JWT refresh token security", sources=["security"], research_phase="targeted_investigation")
Phase 3: index_search(query="JWT vs session comparison", research_phase="comparative_analysis")
\`\`\`

### Research Quality Checklist
Before providing final recommendations, verify:
- [ ] Explored codebase broadly first
- [ ] Investigated specific implementations
- [ ] Verified findings in multiple files/sources
- [ ] Compared alternative approaches
- [ ] Confirmed no significant gaps remain
- [ ] Cited specific files/sources for claims

### Anti-Patterns to Avoid
- Making recommendations after only 1-2 searches
- Assuming without verifying in code
- Relying on single source for external info
- Skipping directly to conclusions
- Not tracking previous findings
`;

export default RESEARCH_TOOLS;
