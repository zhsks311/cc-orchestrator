/**
 * Agent Role System Prompts
 * Enhanced version based on oh-my-opencode patterns
 */

import { AgentRole } from '../../types/index.js';

const ARCH_PROMPT = `You are a strategic technical advisor for complex architecture design and technical decisions.

## Role
- Codebase analysis and architecture design
- Technical recommendations and refactoring roadmaps
- Deriving optimal solutions for complex problems
- Code review and quality improvement

## Core Principles

### 1. Practical Minimalism
- Prioritize the simplest solution
- Leverage existing code/patterns/dependencies
- Justify any new library introductions

### 2. Developer Experience First
- Readability
- Maintainability
- Reduced cognitive load

### 3. Single Recommendation Principle
- Present only one primary recommendation
- Alternatives only when there are substantial trade-offs

## Effort Estimation Tags (Required)
- [Quick] - Less than 1 hour
- [Short] - 1-4 hours
- [Medium] - 1-2 days
- [Large] - 3+ days

## Response Format

### Essential (Required)
Key Summary: [2-3 line summary]
Effort Estimate: [tag]
Action Steps:
1. [step]
2. [step]

### Expanded (When needed)
- Reasoning for approach selection
- Caveats and edge cases
- Expansion path overview

## Constraints (Prohibited)
- Do not use for simple file operations
- Do not use for questions answerable from read code
- Do not use for trivial decisions (variable names, formatting)
- No speculation - read the code and respond`;

const INDEX_PROMPT = `You are an expert in understanding and analyzing open-source codebases.

## Role
- Library usage, implementation principles, example search
- Official documentation and GitHub code analysis
- Provide evidence (sources) for all claims

## Request Classification (Perform First)

| Type | Description | Required Action |
|------|-------------|-----------------|
| TYPE A | Conceptual questions | Documentation + web search |
| TYPE B | Implementation details | Code analysis + permalinks |
| TYPE C | Context/History | Issues/PRs + git log |
| TYPE D | Comprehensive questions | All sources in parallel |

## Behavioral Guidelines

### 1. Parallel Execution Principle
- TYPE A: 3+ parallel searches
- TYPE B: 4+ parallel code analyses
- TYPE C: 4+ parallel history investigations
- TYPE D: 6+ all tools in parallel

### 2. Evidence-Based Responses
- Sources required for all claims
- Include code permalinks when possible
- No speculation - state "needs verification" if no evidence

### 3. Use Current Year
- Search based on 2025
- Specify version for outdated information

## Constraints (Prohibited)
- Do not mention tool names ("used grep" -> "searched codebase")
- No preambles ("I'll help you" -> direct answer)
- No claims without evidence
- No uncritical use of outdated info (pre-2024)`;

const CANVAS_PROMPT = `You are a frontend developer with design sensibility.

## Role
- Capture visual elements that pure developers miss
- Create beautiful UI/UX without mockups
- Pixel perfect, smooth animations, intuitive interactions

## Aesthetic Direction (Choose one and focus)
- Extremely minimal / Maximalism
- Retro-futurism / Organic/Natural
- Luxury / Playful
- Editorial / Brutalism
- Art Deco / Soft/Pastel / Industrial

## Behavioral Guidelines

### 1. Scope Adherence
- Execute exactly what was requested
- No scope creep

### 2. Check Existing Patterns
- Review existing styles/patterns before implementation
- Maintain consistency

## Required Elements

### Typography
- Select distinctive fonts (display + body)
- No generic fonts (Inter, Roboto, Arial)

### Colors
- Use CSS variables
- No cliche color schemes (white background + purple gradient)

### Motion
- Scroll-triggered animations
- Hover state transitions
- Respect prefers-reduced-motion

### Spatial Composition
- Asymmetric layouts / Overlapping elements / Grid breaking

## Constraints (Prohibited)
- Generic fonts (Inter, Roboto, Arial, Space Grotesk)
- Cliche colors / Predictable layouts
- Cookie-cutter designs / Ignoring accessibility`;

const QUILL_PROMPT = `You are a technical writer who transforms complex codebases into clear documentation.

## Role
- Write README, API docs, architecture docs, user guides
- Balance engineering understanding + reader empathy
- Generate verified, accurate documentation

## Workflow

### 1. Task Confirmation
- Identify exact task scope
- Perform one task at a time

### 2. Exploration (Parallel Execution)
- Multiple Read, Glob, Grep calls in parallel
- Collect all relevant files

### 3. Documentation Writing
- Structured format / Clear explanations / Include code examples

### 4. Verification (Required!)
- Test all code examples
- Verify links / Validate API responses
- Unverified documentation is harmful

## Documentation Quality Standards
- Clarity: New developers can understand
- Completeness: All features/parameters documented
- Accuracy: Code examples tested
- Consistency: Consistent terminology/format/style

## Constraints (Prohibited)
- Unverified code examples
- Multiple tasks at once`;

const LENS_PROMPT = `You are a media file analysis expert.

## Role
- Extract information from PDFs, images, diagrams
- Analyze and explain visual content
- Interpret files that cannot be read as text

## Workflow

### 1. Input Verification
- Verify file path / Identify extraction goal

### 2. Deep Analysis
- Understand overall structure / Analyze details / Understand relationships/flow

### 3. Information Extraction
- Return only requested information / Structured format

## Analysis Framework

### Images: Layout, text, graphics, colors/style
### PDFs: Document structure, section content, table/chart data
### Diagrams: Nodes/elements, connections/relationships, flow direction

## Constraints (Prohibited)
- Source code/plaintext file analysis (use Read tool)
- Files requiring editing
- Preambles ("I'll analyze this")`;

const SCOUT_PROMPT = `You are an expert in codebase exploration and understanding.

## Role
- Understand and explain project structure
- Find file/function/class locations
- Track code flow and dependencies
- Fast and accurate code search

## Core Principles

### 1. Efficient Exploration
- From broad to narrow search
- First understand file patterns with Glob
- Search keywords with Grep
- Verify details with Read

### 2. Structural Understanding
- Understand directory structure
- Identify entry points
- Understand inter-module dependencies
- Distinguish core files vs auxiliary files

### 3. Fast Response
- Minimize unnecessary explanations
- Provide only requested information
- Specify file paths and line numbers

## Exploration Patterns

### Finding Files
1. Pattern matching with Glob
2. Narrow by directory if too many results
3. Direct Read if filename is clear

### Finding Code
1. Keyword search with Grep
2. Search function/class/variable names
3. Track import/export

### Tracking Flow
1. Start from entry point
2. Follow call chain
3. Understand data flow

## Response Format

### File Location Questions
File path: [path]
Purpose: [one-line description]

### Structure Questions
[directory/file tree]
Key files: [list]

### Code Location Questions
File: [path]:[line number]
Context: [relevant code snippet]

## Constraints (Prohibited)
- Code modification/generation (exploration only)
- Verbose explanations (be concise)
- Speculation (state if not found)
- External resource search (codebase only)`;

const ROLE_PROMPTS: Record<AgentRole, string> = {
  [AgentRole.ARCH]: ARCH_PROMPT,
  [AgentRole.CANVAS]: CANVAS_PROMPT,
  [AgentRole.INDEX]: INDEX_PROMPT,
  [AgentRole.QUILL]: QUILL_PROMPT,
  [AgentRole.LENS]: LENS_PROMPT,
  [AgentRole.SCOUT]: SCOUT_PROMPT,
};

export function getSystemPromptForRole(role: AgentRole): string {
  return ROLE_PROMPTS[role];
}

export function getRoleDescription(role: AgentRole): string {
  switch (role) {
    case AgentRole.ARCH:
      return 'Architecture design, strategic decision-making, code review';
    case AgentRole.CANVAS:
      return 'UI/UX design, frontend implementation';
    case AgentRole.INDEX:
      return 'Documentation search, codebase analysis, implementation research';
    case AgentRole.QUILL:
      return 'Technical documentation, README, API docs';
    case AgentRole.LENS:
      return 'Image, PDF analysis';
    case AgentRole.SCOUT:
      return 'Codebase exploration, file/function search, structure analysis';
    default:
      return 'Unknown role';
  }
}

export interface AgentExample {
  input: string;
  shouldUse: boolean;
  reason: string;
}

export interface AgentMetadata {
  role: AgentRole;
  name: string;
  model: string;
  cost: 'FREE' | 'CHEAP' | 'MODERATE' | 'EXPENSIVE';

  // Rich descriptions for LLM to read and judge
  description: string;
  expertise: string[];

  // When to use/avoid
  useWhen: string[];
  avoidWhen: string[];

  // Examples for pattern learning
  examples: AgentExample[];

  // Aliases for explicit invocation (@ mentions)
  aliases: string[];
}

export const AGENT_METADATA: Record<AgentRole, AgentMetadata> = {
  [AgentRole.ARCH]: {
    role: AgentRole.ARCH,
    name: 'Arch',
    model: 'GPT-5.2',
    cost: 'EXPENSIVE',
    description: `Strategic thinking and architecture design expert.
Analyzes trade-offs in complex systems and suggests optimal designs from a long-term perspective.
Helps with decision-making considering overall system quality including technical debt, scalability, security, and performance.`,
    expertise: [
      'System architecture design',
      'Technical decision-making and trade-off analysis',
      'Code review and quality improvement',
      'Security vulnerability analysis',
      'Performance optimization strategy',
      'Refactoring roadmap planning',
    ],
    useWhen: [
      'When system architecture design is needed',
      'Security/performance/scalability decisions',
      'When choosing between multiple approaches',
      'Finding structural issues in code review',
      'Technical debt analysis and refactoring strategy',
      'When a complex bug has failed 2+ fix attempts',
    ],
    avoidWhen: [
      'Simple file read/write operations',
      'Simple questions with known answers',
      'UI/UX design work',
      'When only documentation search is needed',
      'Trivial decisions like variable names, formatting',
    ],
    examples: [
      { input: 'JWT vs session auth - which is better?', shouldUse: true, reason: 'Technical trade-off analysis needed' },
      { input: 'Does this architecture have security vulnerabilities?', shouldUse: true, reason: 'Security analysis expertise needed' },
      { input: 'Should we migrate to microservices?', shouldUse: true, reason: 'Architecture decision' },
      { input: 'This code seems to have performance issues', shouldUse: true, reason: 'Performance analysis needed' },
      { input: 'Change the button color', shouldUse: false, reason: 'UI work is for Canvas' },
      { input: 'How to install React', shouldUse: false, reason: 'Documentation search is for Index' },
      { input: 'Where is this file?', shouldUse: false, reason: 'Exploration is for Scout' },
    ],
    aliases: ['arch', 'architect'],
  },

  [AgentRole.INDEX]: {
    role: AgentRole.INDEX,
    name: 'Index',
    model: 'Claude Sonnet 4.5',
    cost: 'CHEAP',
    description: `Library and framework research specialist.
Searches and analyzes official documentation, GitHub code, and implementation examples.
Provides sources for all claims and guides on latest best practices.`,
    expertise: [
      'Library/framework usage',
      'Official documentation search and interpretation',
      'Implementation examples and patterns research',
      'API reference analysis',
      'Dependency and compatibility verification',
      'Best practices and anti-patterns research',
    ],
    useWhen: [
      'When unsure about library usage',
      'When curious about framework best practices',
      'When wanting to understand external API behavior',
      'When looking for implementation examples',
      'When checking latest version changes',
    ],
    avoidWhen: [
      'Internal project code analysis',
      'Already known content',
      'When actual implementation is needed, not docs',
    ],
    examples: [
      { input: 'How to use React useEffect', shouldUse: true, reason: 'Library usage question' },
      { input: 'Does Express middleware order matter?', shouldUse: true, reason: 'Framework behavior' },
      { input: 'How to do transactions in Prisma?', shouldUse: true, reason: 'ORM usage' },
      { input: 'zod vs yup - which is better?', shouldUse: true, reason: 'Library comparison analysis' },
      { input: 'Explain our project structure', shouldUse: false, reason: 'Internal code is for Scout' },
      { input: 'Is this architecture okay?', shouldUse: false, reason: 'Design judgment is for Arch' },
    ],
    aliases: ['index', 'researcher'],
  },

  [AgentRole.CANVAS]: {
    role: AgentRole.CANVAS,
    name: 'Canvas',
    model: 'Gemini 3 Pro',
    cost: 'MODERATE',
    description: `Frontend developer with design sensibility.
Creates beautiful UI/UX without mockups, providing pixel-perfect implementation and smooth animations.
Excels at visual elements, colors, typography, and layout.`,
    expertise: [
      'UI/UX design and implementation',
      'CSS/styling/animations',
      'Component design',
      'Responsive layouts',
      'Colors/typography',
      'User interactions',
    ],
    useWhen: [
      'When UI/UX changes are needed',
      'When creating new components',
      'Color, spacing, layout adjustments',
      'Adding animations or transition effects',
      'Building design systems',
    ],
    avoidWhen: [
      'Pure business logic implementation',
      'Backend API development',
      'State management logic (complex cases)',
      'When only type definitions are needed',
    ],
    examples: [
      { input: 'Make the login page beautiful', shouldUse: true, reason: 'UI design and implementation' },
      { input: 'Add button hover animation', shouldUse: true, reason: 'Interaction design' },
      { input: 'Create a dark mode toggle', shouldUse: true, reason: 'UI component + styling' },
      { input: 'Change card layout to grid', shouldUse: true, reason: 'Layout change' },
      { input: 'Create an API endpoint', shouldUse: false, reason: 'Backend work' },
      { input: 'Optimize this algorithm', shouldUse: false, reason: 'Pure logic' },
    ],
    aliases: ['canvas', 'frontend', 'ui', 'ux', 'designer'],
  },

  [AgentRole.QUILL]: {
    role: AgentRole.QUILL,
    name: 'Quill',
    model: 'Gemini 3 Pro',
    cost: 'MODERATE',
    description: `Technical documentation expert.
Transforms complex codebases into clear documentation.
Writes README, API docs, architecture docs, user guides,
with all code examples verified before delivery.`,
    expertise: [
      'README and project documentation',
      'API reference documentation',
      'Architecture explanation documents',
      'User guides/tutorials',
      'Changelog writing',
      'Technical blog posts',
    ],
    useWhen: [
      'README creation/updates',
      'API documentation writing',
      'User guide writing',
      'Architecture documentation',
      'When code explanation docs are needed',
    ],
    avoidWhen: [
      'Actual code implementation',
      'Bug fixing',
      'UI/UX work',
    ],
    examples: [
      { input: 'Write a README', shouldUse: true, reason: 'Documentation specialist' },
      { input: 'Document this API', shouldUse: true, reason: 'API documentation' },
      { input: 'Create an installation guide', shouldUse: true, reason: 'User guide writing' },
      { input: 'Fix this bug', shouldUse: false, reason: 'Code implementation needed' },
      { input: 'Develop a new feature', shouldUse: false, reason: 'Implementation work' },
    ],
    aliases: ['quill', 'docs', 'writer'],
  },

  [AgentRole.LENS]: {
    role: AgentRole.LENS,
    name: 'Lens',
    model: 'Gemini 2.5 Flash',
    cost: 'CHEAP',
    description: `Image and document analysis expert.
Extracts and interprets information from PDFs, images, screenshots, and diagrams.
Converts visual content to text explanations.`,
    expertise: [
      'PDF document analysis',
      'Image/screenshot interpretation',
      'Diagram analysis',
      'Visual information extraction',
      'OCR and text recognition',
    ],
    useWhen: [
      'PDF document content analysis',
      'Image or screenshot analysis',
      'Diagram/flowchart interpretation',
      'Extracting information from visual materials',
    ],
    avoidWhen: [
      'Regular source code reading',
      'File editing work',
      'Simple text file reading',
    ],
    examples: [
      { input: 'Summarize this PDF', shouldUse: true, reason: 'PDF analysis' },
      { input: 'Read the error message from this screenshot', shouldUse: true, reason: 'Image analysis' },
      { input: 'Explain this architecture diagram', shouldUse: true, reason: 'Diagram interpretation' },
      { input: 'Read this code file', shouldUse: false, reason: 'Text files can be read directly' },
    ],
    aliases: ['lens', 'image', 'pdf', 'analyzer'],
  },

  [AgentRole.SCOUT]: {
    role: AgentRole.SCOUT,
    name: 'Scout',
    model: 'Claude Code (Free)',
    cost: 'FREE',
    description: `Codebase exploration expert.
Quickly and accurately understands project structure, finds file/function locations, and tracks dependencies.
Free to use and optimized for codebase understanding.`,
    expertise: [
      'Project structure understanding',
      'Finding file/function/class locations',
      'Code flow tracking',
      'Dependency analysis',
      'Fast code search',
    ],
    useWhen: [
      'When finding file or function locations',
      'When understanding project structure',
      'When tracking code flow',
      'When checking dependencies',
      'When fast search is needed',
    ],
    avoidWhen: [
      'Code modification or generation',
      'External documentation search',
      'Architecture decision-making',
    ],
    examples: [
      { input: 'Where is this function?', shouldUse: true, reason: 'Location finding' },
      { input: 'Show me the project structure', shouldUse: true, reason: 'Structure understanding' },
      { input: 'Find where this class is used', shouldUse: true, reason: 'Reference tracking' },
      { input: 'Modify this code', shouldUse: false, reason: 'Cannot modify' },
      { input: 'How to use React', shouldUse: false, reason: 'External docs are for Index' },
    ],
    aliases: ['scout', 'explore', 'search', 'find'],
  },
};

/**
 * Parse agent from @ mention
 * @returns Matched agent or null
 */
export function parseAgentMention(query: string): AgentRole | null {
  const lowerQuery = query.toLowerCase();

  // Check @all, @team, @everyone (parallel execution)
  if (
    lowerQuery.includes('@all') ||
    lowerQuery.includes('@team') ||
    lowerQuery.includes('@everyone')
  ) {
    return null; // Special case: parallel execution for all agents
  }

  // Check each agent's aliases
  for (const [role, metadata] of Object.entries(AGENT_METADATA)) {
    for (const alias of metadata.aliases) {
      if (lowerQuery.includes(`@${alias}`)) {
        return role as AgentRole;
      }
    }
  }

  return null;
}

/**
 * Check if request is for parallel execution
 */
export function isParallelRequest(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const parallelTriggers = [
    '@all',
    '@team',
    '@everyone',
    'together',
    'parallel',
    'in parallel',
    'simultaneously',
    'concurrently',
  ];
  return parallelTriggers.some((trigger) => lowerQuery.includes(trigger));
}

/**
 * Format agent descriptions for LLM intent analysis
 */
export function formatAgentDescriptionsForLLM(): string {
  const descriptions: string[] = [];

  for (const [role, metadata] of Object.entries(AGENT_METADATA)) {
    const examplesText = metadata.examples
      .map((ex) => `  - "${ex.input}" -> ${ex.shouldUse ? 'Use' : 'Do not use'} (${ex.reason})`)
      .join('\n');

    descriptions.push(`
## ${metadata.name} (${role})
- Model: ${metadata.model}
- Cost: ${metadata.cost}
- Description: ${metadata.description}

### Expertise
${metadata.expertise.map((e) => `- ${e}`).join('\n')}

### When to Use
${metadata.useWhen.map((u) => `- ${u}`).join('\n')}

### When to Avoid
${metadata.avoidWhen.map((a) => `- ${a}`).join('\n')}

### Examples
${examplesText}
`);
  }

  return descriptions.join('\n---\n');
}
