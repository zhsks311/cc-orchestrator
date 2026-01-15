/**
 * MCP Tool Definitions
 * Renamed to match oh-my-opencode patterns
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'background_task',
    description: `백그라운드에서 전문 에이전트를 실행합니다. 즉시 task_id를 반환하고 작업은 비동기로 진행됩니다.

사용 가능한 에이전트:
- arch (GPT-5.2): 아키텍처 설계, 전략적 의사결정, 코드 리뷰
- index (Claude Sonnet 4.5): 문서 검색, 코드베이스 분석, 구현 사례 조사
- canvas (Gemini 3 Pro): UI/UX 디자인, 프론트엔드 구현
- quill (Gemini 3 Pro): 기술 문서 작성, README, API 문서
- lens (Gemini 3 Flash): 이미지, PDF 분석
- scout (Claude Sonnet): 코드베이스 탐색, 파일/함수 검색, 구조 파악 (무료)

병렬 실행 권장:
background_task(agent="arch", prompt="아키텍처 검토...")
background_task(agent="index", prompt="레퍼런스 조사...")
// 두 작업이 동시에 실행됨`,
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['arch', 'canvas', 'index', 'quill', 'lens', 'scout'],
          description: '실행할 에이전트',
        },
        prompt: {
          type: 'string',
          description: '에이전트에게 전달할 작업 프롬프트',
        },
        description: {
          type: 'string',
          description: '작업에 대한 짧은 설명 (추적용, 선택)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: '작업 우선순위 (기본: medium)',
        },
      },
      required: ['agent', 'prompt'],
    },
  },
  {
    name: 'background_output',
    description: `백그라운드 작업의 상태를 확인하거나 결과를 가져옵니다.

block=false (기본): 즉시 현재 상태 반환 - 작업 진행 중에도 다른 작업 계속 가능
block=true: 작업 완료까지 대기 후 결과 반환

권장 패턴:
1. 여러 작업을 background_task로 실행
2. 다른 작업을 하면서 주기적으로 block=false로 상태 확인
3. 결과가 필요한 시점에 block=true로 대기`,
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: '확인할 작업 ID (background_task 반환값)',
        },
        block: {
          type: 'boolean',
          description: 'true: 완료까지 대기, false: 즉시 상태 반환 (기본: false)',
        },
        timeout_ms: {
          type: 'number',
          description: 'block=true일 때 최대 대기 시간 (밀리초, 기본: 300000 = 5분)',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'background_cancel',
    description: `실행 중인 백그라운드 작업을 취소합니다.

task_id: 특정 작업만 취소
all=true: 모든 실행 중인 작업 취소

작업 완료 후 정리할 때 all=true 사용 권장.`,
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: '취소할 특정 작업 ID',
        },
        all: {
          type: 'boolean',
          description: 'true: 모든 실행 중인 작업 취소',
        },
      },
    },
  },
  {
    name: 'list_tasks',
    description: '현재 세션의 모든 백그라운드 작업 목록을 조회합니다.',
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
              description: '상태 필터',
            },
            agent: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['arch', 'canvas', 'index', 'quill', 'lens'],
              },
              description: '에이전트 필터',
            },
          },
        },
      },
    },
  },
  {
    name: 'share_context',
    description: '에이전트 간에 컨텍스트를 공유합니다. 이전 작업의 결과를 다음 작업에 전달할 때 사용합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: '컨텍스트 키 (고유 식별자)',
        },
        value: {
          description: '저장할 값 (객체, 문자열, 숫자 등)',
        },
        scope: {
          type: 'string',
          enum: ['session', 'global'],
          description: '공유 범위 (기본: session)',
        },
        ttl_seconds: {
          type: 'number',
          description: '만료 시간 (초, 선택사항)',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'get_context',
    description: '공유된 컨텍스트를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: '조회할 컨텍스트 키',
        },
        scope: {
          type: 'string',
          enum: ['session', 'global'],
          description: '조회 범위 (기본: session)',
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
          description: '분석할 사용자 요청 텍스트',
        },
      },
      required: ['query'],
    },
  },
];

export function getToolDefinitions(): Tool[] {
  return TOOL_DEFINITIONS;
}
