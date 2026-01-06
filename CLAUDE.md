# CC Orchestrator Project Instructions

## 프로젝트 개요
Claude Code Multi-Model Orchestrator (CC Orchestrator) - MCP 서버로 GPT, Gemini, Claude를 병렬 활용

## Compact 후 자동 복구 지침

**세션 시작 시 반드시 수행:**
1. `PROGRESS_REPORT.md` 파일을 읽어 현재 진행 상황 파악
2. Todo 목록에서 `pending` 상태인 첫 번째 작업부터 순차 수행
3. 각 작업 완료 후 셀프 QA 수행
4. `PROGRESS_REPORT.md` 업데이트

## 작업 흐름

### 1. 작업 시작
```
1. PROGRESS_REPORT.md 읽기
2. 현재 pending 작업 확인
3. 작업 수행
```

### 2. 작업 완료 후 셀프 QA
```
1. 타입 검사: npx tsc --noEmit
2. 파일 존재 확인: 생성한 파일들이 올바른 위치에 있는지
3. import 경로 검증: .js 확장자 포함 여부
4. 에러 핸들링 확인
```

### 3. 레포트 업데이트
```
1. 완료된 작업을 PROGRESS_REPORT.md에 기록
2. 발생한 이슈나 변경사항 기록
3. 다음 작업 명시
```

## 핵심 파일 위치

| 파일 | 용도 |
|------|------|
| `PROGRESS_REPORT.md` | 진행 상황 레포트 (컨텍스트 복구용) |
| `F:\prd.txt` | PRD 원본 |
| `src/types/` | 타입 정의 |
| `src/core/` | 핵심 비즈니스 로직 |
| `src/server/` | MCP 서버 코드 |

## 코딩 컨벤션

- TypeScript ES Module (.js 확장자 import)
- Zod 스키마 검증
- 구조화된 JSON 로깅 (stderr)
- 에러는 CC OrchestratorError 상속

## 현재 상태

모든 Phase 완료! 전체 구현이 완료되었습니다.

### 완료된 작업
- ✅ **[Phase 1-6]** 전체 구현 완료
- ✅ **OrchestrationEngine** - DAG 기반 워크플로우 실행
- ✅ **빌드 및 타입 검사** 통과

## 셀프 QA 체크리스트

### 타입 검사
```bash
cd F:\Dev_Project\cc-orchestrator
npx tsc --noEmit
```

### 빌드 테스트
```bash
npm run build
```

### 런타임 테스트
```bash
npm start
# 또는 MCP Inspector로 도구 호출 테스트
```

### 도구별 테스트 시나리오
1. `spawn_agent` - oracle 역할로 간단한 작업 생성
2. `check_agent` - 생성된 에이전트 상태 확인
3. `wait_agent` - 완료 대기 및 결과 확인
4. `list_agents` - 전체 에이전트 목록
5. `share_context` / `get_shared_context` - 컨텍스트 공유
6. `auto_orchestrate` - "ultrawork" 키워드로 병렬 실행

## 환경변수 (테스트용)

```bash
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
LOG_LEVEL=debug
```

---

**이 파일은 compact 후 컨텍스트 복구를 위한 핵심 지침입니다.**
**세션 시작 시 반드시 PROGRESS_REPORT.md를 먼저 읽으세요.**
