/**
 * MCP Tool Schemas
 * Renamed to match oh-my-opencode patterns
 */

import { z } from 'zod';
import { AgentRole, AgentStatus, Priority, ContextScope } from '../../types/index.js';

// background_task (was spawn_agent)
export const BackgroundTaskInputSchema = z.object({
  agent: z.nativeEnum(AgentRole).describe('실행할 에이전트 (oracle, librarian, frontend-engineer, document-writer, multimodal-analyzer)'),
  prompt: z.string().min(1).max(10000).describe('에이전트에게 전달할 작업 프롬프트'),
  description: z.string().min(1).max(200).optional().describe('작업에 대한 짧은 설명 (추적용)'),
  priority: z.nativeEnum(Priority).optional().default(Priority.MEDIUM).describe('작업 우선순위'),
});

export type BackgroundTaskInput = z.infer<typeof BackgroundTaskInputSchema>;

// background_output (was wait_agent + check_agent merged)
export const BackgroundOutputInputSchema = z.object({
  task_id: z.string().uuid().describe('확인할 작업 ID'),
  block: z.boolean().optional().default(false).describe('true: 완료까지 대기, false: 즉시 현재 상태 반환 (기본값)'),
  timeout_ms: z.number().min(1000).max(600000).optional().default(300000).describe('block=true일 때 최대 대기 시간 (ms)'),
});

export type BackgroundOutputInput = z.infer<typeof BackgroundOutputInputSchema>;

// background_cancel (was cancel_agent)
export const BackgroundCancelInputSchema = z.object({
  task_id: z.string().uuid().optional().describe('취소할 특정 작업 ID'),
  all: z.boolean().optional().default(false).describe('true: 모든 실행 중인 작업 취소'),
}).refine(
  (data) => data.task_id || data.all,
  { message: 'task_id 또는 all=true 중 하나는 필수입니다' }
);

export type BackgroundCancelInput = z.infer<typeof BackgroundCancelInputSchema>;

// list_tasks (was list_agents)
export const ListTasksInputSchema = z.object({
  filter: z.object({
    status: z.array(z.nativeEnum(AgentStatus)).optional(),
    agent: z.array(z.nativeEnum(AgentRole)).optional(),
  }).optional(),
});

export type ListTasksInput = z.infer<typeof ListTasksInputSchema>;

// share_context (유지)
export const ShareContextInputSchema = z.object({
  key: z.string().min(1).max(256).describe('컨텍스트 키'),
  value: z.unknown().describe('저장할 값'),
  scope: z.nativeEnum(ContextScope).optional().default(ContextScope.SESSION).describe('공유 범위'),
  ttl_seconds: z.number().min(60).max(86400).optional().describe('만료 시간 (초)'),
});

export type ShareContextInput = z.infer<typeof ShareContextInputSchema>;

// get_context (was get_shared_context)
export const GetContextInputSchema = z.object({
  key: z.string().min(1).max(256).describe('조회할 컨텍스트 키'),
  scope: z.nativeEnum(ContextScope).optional().default(ContextScope.SESSION).describe('조회 범위'),
});

export type GetContextInput = z.infer<typeof GetContextInputSchema>;

// suggest_agent - Key Trigger based agent recommendation
export const SuggestAgentInputSchema = z.object({
  query: z.string().min(1).max(2000).describe('User request text to analyze'),
});

export type SuggestAgentInput = z.infer<typeof SuggestAgentInputSchema>;
