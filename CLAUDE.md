# CC Orchestrator 개발 가이드

Claude Code에서 멀티 LLM 오케스트레이션을 위한 MCP 서버.

## 핵심 제약

### MCP 프로토콜

```
stdout = MCP JSON-RPC 전용 (절대 console.log 금지)
stderr = 로깅 전용 (Logger 클래스 사용)
```

`console.log`를 쓰면 MCP 프로토콜이 깨진다. 반드시 `Logger`를 사용할 것.

### 비동기 실행 패턴

에이전트 실행은 **fire-and-forget** 패턴:

```typescript
// createAgent()는 즉시 반환
const agent = await this.agentManager.createAgent(params);
// 실행은 백그라운드에서 진행
// executionPromises Map에서 Promise 추적
```

Claude Code가 블로킹되면 안 됨. 사용자가 `block=true`로 명시적 대기 가능.

### 터미널 상태

```typescript
private isTerminalStatus(status: AgentStatus): boolean {
  return [COMPLETED, FAILED, CANCELLED, TIMEOUT].includes(status);
}
```

터미널 상태인 에이전트는 취소/수정 불가. 항상 체크 후 작업.

## 코드 컨벤션

### 인터페이스 우선

```typescript
// 항상 인터페이스 먼저 정의
export interface IAgentManager {
  createAgent(params: CreateAgentParams): Promise<Agent>;
}

// 클래스는 인터페이스 구현
export class AgentManager implements IAgentManager {
```

### 에러 클래스 계층

```typescript
CCOError (추상 베이스)
├── Client Errors (4xx, retryable=false)
│   ├── ValidationError (400)
│   ├── AgentNotFoundError (404)
│   └── InvalidRoleError (400)
└── Server Errors (5xx, retryable=true)
    ├── ModelAPIError (502)
    ├── TimeoutError (504)
    └── RateLimitError (429)
```

`retryable` 플래그로 재시도 가능 여부 표시.

```typescript
// 좋음: 구체적인 에러 클래스
throw new AgentNotFoundError(agentId);

// 나쁨: 일반 Error
throw new Error(`Agent ${agentId} not found`);
```

### Zod 스키마 검증

모든 tool 입력은 핸들러 첫 줄에서 검증:

```typescript
private async handleBackgroundTask(args: unknown): Promise<ToolResult> {
  const input = BackgroundTaskInputSchema.parse(args);  // 첫 줄
  // ...
}
```

### Tool 응답 포맷

```typescript
// 성공
return this.formatResult({ task_id: agent.id, status: 'running' });

// 실패 (isError: true 포함)
return this.formatError(error);
```

### 로깅

```typescript
this.logger.info('Agent created', {
  agentId: agent.id,
  role: agent.role,
  sessionId: agent.sessionId,
});
// 민감 정보(apiKey, password, token, secret)는 자동 마스킹
```

### 네이밍

| 종류 | 규칙 | 예시 |
|------|------|------|
| 클래스 | PascalCase | `AgentManager` |
| 인터페이스 | I + PascalCase | `IAgentManager` |
| 메서드 | camelCase | `createAgent` |
| 상수 | UPPER_SNAKE | `AgentStatus.RUNNING` |
| 파일명 | PascalCase.ts | `AgentManager.ts` |

### import 순서

```typescript
// 1. 외부 패키지
import { v4 as uuidv4 } from 'uuid';

// 2. 내부 타입/에러
import { Agent, AgentStatus } from '../../types/index.js';
import { AgentNotFoundError } from '../../types/errors.js';

// 3. 내부 모듈
import { ModelRouter } from '../models/ModelRouter.js';
import { Logger } from '../../infrastructure/Logger.js';
```

**ESM이므로 `.js` 확장자 필수.**

## 디렉토리 구조

```
src/core/           # 순수 비즈니스 로직 (MCP 의존성 없음)
src/server/         # MCP 프로토콜 처리
src/types/          # 타입 + 에러 정의
src/infrastructure/ # 로깅, 공통 유틸
```

`core/`는 `server/`를 import하면 안 됨 (단방향 의존).

## 확장 기능 개발 워크플로우

Hook, Skill, Agent, MCP 등 Claude Code 확장 기능 개발 시 반드시 아래 순서를 따른다:

### 1. 프로젝트 내 개발 (Source of Truth)

```
oh-my-claudecode/
├── hooks/          # Hook 스크립트 개발
├── skills/         # Skill 정의 개발
├── src/            # MCP 서버/Agent 개발
└── scripts/        # 설치/배포 스크립트
```

**모든 코드는 이 프로젝트에서 먼저 작성하고 테스트한다.**

### 2. 개발자 환경에 설치

```bash
npm run setup        # ~/.claude/에 설치
npm run setup --force  # 강제 재설치
```

설치 스크립트가 프로젝트 파일을 개발자 환경(`~/.claude/`)에 복사/링크한다.

### 3. 개발 사이클

```
[프로젝트에서 수정] → [npm run setup] → [Claude Code에서 테스트] → [커밋]
```

**절대 `~/.claude/`에서 직접 수정하지 않는다.** 항상 프로젝트가 원본이다.

### 디렉토리 매핑

| 프로젝트 | 설치 위치 | 용도 |
|----------|-----------|------|
| `hooks/` | `~/.claude/hooks/` | Hook 스크립트 |
| `skills/` | `~/.claude/skills/` | Skill 정의 |
| `hooks/config.json` | `~/.claude/settings.json` (merge) | Hook 설정 |

## 새 기능 추가

### 에이전트 추가

1. `src/types/agent.ts` → `AgentRole` enum
2. `src/types/model.ts` → `ROLE_MODEL_MAPPING`
3. `src/core/agents/prompts.ts` → 시스템 프롬프트 + `AGENT_METADATA`

### Tool 추가

1. `src/server/tools/definitions.ts` → tool 정의
2. `src/server/tools/schemas.ts` → Zod 스키마
3. `src/server/handlers/index.ts` → switch case + 핸들러 메서드

## 디버깅

```bash
LOG_LEVEL=debug npm run dev
```

| 증상 | 원인 | 해결 |
|------|------|------|
| MCP 연결 안됨 | stdout 오염 | console.log 제거 |
| 에이전트 실패 | API 키 누락 | .env 확인 |
| 타임아웃 | 느린 응답 | CCO_TIMEOUT_SECONDS 증가 |

## 비용 참고

- `scout`: 무료 (Claude 3.5 Sonnet)
- `index`: 저렴 (Claude Sonnet 4.5)
- `arch`: 비쌈 (GPT-5.2)

개발 중에는 `scout` 사용 권장.
