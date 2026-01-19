/**
 * MCP Tool Schemas
 * Renamed to match oh-my-opencode patterns
 */

import { z } from 'zod';
import { AgentRole, AgentStatus, Priority, ContextScope } from '../../types/index.js';

// background_task (was spawn_agent)
export const BackgroundTaskInputSchema = z.object({
  agent: z.nativeEnum(AgentRole).describe('Agent to execute (arch, canvas, quill, lens)'),
  prompt: z.string().min(1).max(10000).describe('Task prompt to send to the agent'),
  description: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Short description of the task (for tracking)'),
  priority: z.nativeEnum(Priority).optional().default(Priority.MEDIUM).describe('Task priority'),
});

export type BackgroundTaskInput = z.infer<typeof BackgroundTaskInputSchema>;

// background_output (was wait_agent + check_agent merged)
export const BackgroundOutputInputSchema = z.object({
  task_id: z.string().uuid().describe('Task ID to check'),
  block: z
    .boolean()
    .optional()
    .default(false)
    .describe('true: wait until completion, false: return current status immediately (default)'),
  timeout_ms: z
    .number()
    .min(1000)
    .max(600000)
    .optional()
    .default(300000)
    .describe('Maximum wait time when block=true (ms)'),
});

export type BackgroundOutputInput = z.infer<typeof BackgroundOutputInputSchema>;

// background_cancel (was cancel_agent)
export const BackgroundCancelInputSchema = z
  .object({
    task_id: z.string().uuid().optional().describe('Specific task ID to cancel'),
    all: z.boolean().optional().default(false).describe('true: cancel all running tasks'),
  })
  .refine((data) => data.task_id || data.all, {
    message: 'Either task_id or all=true is required',
  });

export type BackgroundCancelInput = z.infer<typeof BackgroundCancelInputSchema>;

// list_tasks (was list_agents)
export const ListTasksInputSchema = z.object({
  filter: z
    .object({
      status: z.array(z.nativeEnum(AgentStatus)).optional(),
      agent: z.array(z.nativeEnum(AgentRole)).optional(),
    })
    .optional(),
});

export type ListTasksInput = z.infer<typeof ListTasksInputSchema>;

// share_context (maintained)
export const ShareContextInputSchema = z.object({
  key: z.string().min(1).max(256).describe('Context key'),
  value: z.unknown().describe('Value to store'),
  scope: z
    .nativeEnum(ContextScope)
    .optional()
    .default(ContextScope.SESSION)
    .describe('Sharing scope'),
  ttl_seconds: z.number().min(60).max(86400).optional().describe('Expiration time (seconds)'),
});

export type ShareContextInput = z.infer<typeof ShareContextInputSchema>;

// get_context (was get_shared_context)
export const GetContextInputSchema = z.object({
  key: z.string().min(1).max(256).describe('Context key to retrieve'),
  scope: z
    .nativeEnum(ContextScope)
    .optional()
    .default(ContextScope.SESSION)
    .describe('Query scope'),
});

export type GetContextInput = z.infer<typeof GetContextInputSchema>;

// suggest_agent - Key Trigger based agent recommendation
export const SuggestAgentInputSchema = z.object({
  query: z.string().min(1).max(2000).describe('User request text to analyze'),
});

export type SuggestAgentInput = z.infer<typeof SuggestAgentInputSchema>;

// ast_search - AST-based code search
export const AstSearchInputSchema = z.object({
  pattern: z.string().min(1).max(1000).describe('AST pattern to search for'),
  path: z.string().min(1).describe('File or directory path to search in'),
  language: z.string().optional().describe('Programming language (auto-detected if not specified)'),
  max_results: z.number().int().min(1).max(500).optional().default(100).describe('Maximum results'),
});

export type AstSearchInput = z.infer<typeof AstSearchInputSchema>;

// ast_replace - AST-based code replacement
export const AstReplaceInputSchema = z.object({
  pattern: z.string().min(1).max(1000).describe('AST pattern to match'),
  replacement: z.string().min(0).max(2000).describe('Replacement code'),
  path: z.string().min(1).describe('File or directory path'),
  language: z.string().optional().describe('Programming language'),
  dry_run: z.boolean().optional().default(true).describe('Preview without writing'),
});

export type AstReplaceInput = z.infer<typeof AstReplaceInputSchema>;
