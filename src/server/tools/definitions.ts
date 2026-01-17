/**
 * MCP Tool Definitions
 * Renamed to match oh-my-opencode patterns
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'background_task',
    description: `Runs a specialized agent in the background. Returns task_id immediately and the task runs asynchronously.

Available agents:
- arch (GPT-5.2): Architecture design, strategic decision-making, code review
- index (Claude Sonnet 4.5): Documentation search, codebase analysis, implementation research
- canvas (Gemini 3 Pro): UI/UX design, frontend implementation
- quill (Gemini 3 Pro): Technical documentation, README, API docs
- lens (Gemini 3 Pro): Image, PDF analysis
- scout (Claude Sonnet): Codebase exploration, file/function search, structure analysis (Free)

Parallel execution recommended:
background_task(agent="arch", prompt="Review architecture...")
background_task(agent="index", prompt="Research references...")
// Both tasks run simultaneously`,
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['arch', 'canvas', 'index', 'quill', 'lens', 'scout'],
          description: 'Agent to execute',
        },
        prompt: {
          type: 'string',
          description: 'Task prompt to send to the agent',
        },
        description: {
          type: 'string',
          description: 'Short description of the task (for tracking, optional)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Task priority (default: medium)',
        },
      },
      required: ['agent', 'prompt'],
    },
  },
  {
    name: 'background_output',
    description: `Check the status of a background task or retrieve results.

block=false (default): Return current status immediately - can continue other work while task is running
block=true: Wait until task completion and return results

Recommended pattern:
1. Run multiple tasks with background_task
2. Periodically check status with block=false while doing other work
3. Wait with block=true when results are needed`,
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Task ID to check (returned from background_task)',
        },
        block: {
          type: 'boolean',
          description: 'true: wait until completion, false: return status immediately (default: false)',
        },
        timeout_ms: {
          type: 'number',
          description: 'Maximum wait time when block=true (milliseconds, default: 300000 = 5 minutes)',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'background_cancel',
    description: `Cancel running background tasks.

task_id: Cancel specific task only
all=true: Cancel all running tasks

Recommended to use all=true for cleanup after task completion.`,
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Specific task ID to cancel',
        },
        all: {
          type: 'boolean',
          description: 'true: cancel all running tasks',
        },
      },
    },
  },
  {
    name: 'list_tasks',
    description: 'List all background tasks in the current session.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            status: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['queued', 'running', 'completed', 'failed', 'cancelled', 'timeout'],
              },
              description: 'Status filter',
            },
            agent: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['arch', 'canvas', 'index', 'quill', 'lens'],
              },
              description: 'Agent filter',
            },
          },
        },
      },
    },
  },
  {
    name: 'share_context',
    description: 'Share context between agents. Use to pass results from previous tasks to subsequent tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Context key (unique identifier)',
        },
        value: {
          description: 'Value to store (object, string, number, etc.)',
        },
        scope: {
          type: 'string',
          enum: ['session', 'global'],
          description: 'Sharing scope (default: session)',
        },
        ttl_seconds: {
          type: 'number',
          description: 'Expiration time (seconds, optional)',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'get_context',
    description: 'Retrieve shared context.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Context key to retrieve',
        },
        scope: {
          type: 'string',
          enum: ['session', 'global'],
          description: 'Query scope (default: session)',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'suggest_agent',
    description: 'Suggests the best agent for a user request using Key Trigger system. Keywords: architecture/design/review -> arch, library/API/docs -> index, UI/UX/design -> canvas, docs/README -> quill, image/PDF -> lens, find/where/structure -> scout',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'User request text to analyze',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'ast_search',
    description: `Search code using AST (Abstract Syntax Tree) patterns. More precise than text search.

Pattern syntax:
- Literal code: "console.log($MSG)" matches any console.log call
- $VAR: Matches a single AST node (variable, expression, etc.)
- $$$: Matches zero or more nodes (for arguments, statements)

Examples:
- "function $NAME($$$ARGS) { $$$BODY }" - Find all function declarations
- "if ($COND) { $$$BODY }" - Find all if statements
- "$OBJ.$METHOD($$$)" - Find all method calls

Supported languages: typescript, javascript, python, rust, go, java, c, cpp, ruby, swift, kotlin, and more.`,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'AST pattern to search for (use $VAR for wildcards, $$$ for multiple nodes)',
        },
        path: {
          type: 'string',
          description: 'File or directory path to search in',
        },
        language: {
          type: 'string',
          description: 'Programming language (auto-detected from file extension if not specified)',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default: 100)',
        },
      },
      required: ['pattern', 'path'],
    },
  },
  {
    name: 'ast_replace',
    description: `Replace code using AST patterns. Safer than text replacement - respects code structure.

Pattern syntax (same as ast_search):
- $VAR: Captured node, can be used in replacement
- $$$: Multiple nodes

Examples:
- pattern: "console.log($MSG)", replacement: "logger.info($MSG)"
- pattern: "var $NAME = $VAL", replacement: "const $NAME = $VAL"

Use dry_run=true to preview changes without modifying files.`,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'AST pattern to match',
        },
        replacement: {
          type: 'string',
          description: 'Replacement code (can use $VAR to reference captured nodes)',
        },
        path: {
          type: 'string',
          description: 'File or directory path',
        },
        language: {
          type: 'string',
          description: 'Programming language (auto-detected if not specified)',
        },
        dry_run: {
          type: 'boolean',
          description: 'Preview changes without writing to files (default: true)',
        },
      },
      required: ['pattern', 'replacement', 'path'],
    },
  },
];

export function getToolDefinitions(): Tool[] {
  return TOOL_DEFINITIONS;
}
