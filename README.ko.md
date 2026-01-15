# CC Orchestrator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/cc-orchestrator.svg)](https://www.npmjs.com/package/cc-orchestrator)

**Claude Code에서 여러 LLM을 병렬로 활용하는 MCP 서버**

> [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode)의 멀티모델 오케스트레이션 개념을 Claude Code 환경에 맞게 구현한 프로젝트입니다.

---

## 목차

- [개요](#개요)
- [주요 기능](#주요-기능)
- [에이전트 시스템](#에이전트-시스템)
- [빠른 시작](#빠른-시작)
- [사용 방법](#사용-방법)
- [Python Hooks](#python-hooks)
- [Context Resilience Framework](#context-resilience-framework)
- [도구 목록](#도구-목록)
- [프로젝트 구조](#프로젝트-구조)
- [설정](#설정)
- [제거](#제거)

---

## 개요

CC Orchestrator는 Claude Code 환경에서 GPT-5.2, Gemini 3 Pro, Claude Sonnet 4.5 등 다양한 LLM을 **병렬로 활용**할 수 있게 해주는 MCP(Model Context Protocol) 서버입니다.

### 왜 필요한가?

- **단일 모델의 한계**: 하나의 LLM으로 모든 작업을 처리하면 각 모델의 강점을 활용하지 못함
- **병렬 처리의 필요성**: 복잡한 작업을 여러 모델에 동시에 위임하면 효율성 향상
- **전문화의 이점**: 아키텍처 설계에는 GPT, UI 작업에는 Gemini, 문서 검색에는 Claude가 각각 최적화됨

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **멀티모델 병렬 실행** | GPT, Gemini, Claude를 동시에 활용 |
| **전문 에이전트 시스템** | 역할별 최적화된 모델 자동 선택 |
| **Cross-Provider Fallback** | API 키 누락/장애 시 다른 제공자로 자동 전환 |
| **DAG 기반 오케스트레이션** | 의존성 관리 및 자동 워크플로우 |
| **키워드 트리거** | `ultrawork`, `분석`, `찾아` 등으로 자동 실행 |
| **컨텍스트 공유** | 에이전트 간 결과 전달 |
| **Python Hooks** | 코드 리뷰, 완료 오케스트레이션 자동화 |
| **Orchestrate Skill** | `/orchestrate` 명령으로 복잡한 작업 위임 |
| **Context Resilience** | `/compact` 후 문맥 손실 방지 및 자동 복구 |

---

## 에이전트 시스템

### 역할-모델 매핑

| 역할 | 기본 모델 | Fallback | 용도 |
|------|----------|----------|------|
| **arch** | GPT-5.2 | GPT-4o | 아키텍처 설계, 전략적 의사결정, 코드 리뷰 |
| **canvas** | Gemini 3 Pro | Gemini 2.5 Flash | UI/UX 디자인, 프론트엔드 구현 |
| **index** | Claude Sonnet 4.5 | Claude Sonnet 4 | 문서 검색, 코드베이스 분석, 구현 사례 조사 |
| **quill** | Gemini 3 Pro | Gemini 2.5 Flash | 기술 문서 작성, README, API 문서 |
| **lens** | Gemini 2.5 Flash | Gemini 2.0 Flash | 이미지, PDF, 스크린샷 분석 |
| **scout** | Claude Sonnet | - | 코드베이스 탐색 (무료) |

### Cross-Provider Fallback

API 키가 없거나 제공자 장애 시 **다른 제공자로 자동 전환**됩니다:

```
arch:   OpenAI → Anthropic → Google
index:  Anthropic → Google → OpenAI
canvas: Google → Anthropic → OpenAI
quill:  Google → Anthropic → OpenAI
lens:   Google → Anthropic → OpenAI
scout:  Anthropic (무료, Claude Sonnet)
```

**예시:** OpenAI API 키만 있는 경우
- `arch` → OpenAI 사용 ✓
- `index` → Anthropic 없음 → OpenAI로 fallback ⚠
- `canvas` → Google 없음 → OpenAI로 fallback ⚠

---

## 빠른 시작

### 1. 설치 (원라인)

```bash
npx cc-orch
```

또는 수동 설치:

```bash
git clone https://github.com/zhsks311/cc-orchestrator.git
cd cc-orchestrator
npm run setup
```

대화형 설치 스크립트가 다음을 자동으로 수행합니다:
- API 키 입력 (OpenAI, Google, Anthropic)
- `.env` 파일 생성
- 의존성 설치 및 빌드
- **Python Hooks** 설치 (`~/.claude/hooks/`)
- **Skills** 설치 (`~/.claude/skills/`)
- **Settings** 업데이트 (`~/.claude/settings.json`)
- **Claude Desktop Config** 자동 등록

### 2. Claude Code 재시작

설치 완료 후 Claude Code를 재시작하면 모든 기능을 사용할 수 있습니다.

### 설치 및 업데이트 옵션

```bash
# 원라인 설치
npx cc-orch

# 수동 설치 (미설치 항목만)
npm run setup

# 모든 항목 재설치
npm run setup -- --force

# 업데이트 (최신 버전으로)
npm run update

# 업데이트 확인만
npm run update -- --check

# npx로 업데이트
npx cc-orch --upgrade
```

---

## 사용 방법

### 개별 에이전트 호출

자연어로 에이전트를 호출할 수 있습니다:

```
"arch한테 이 프로젝트 아키텍처 리뷰해달라고 해"
"canvas한테 로그인 폼 컴포넌트 만들어줘"
"index한테 React Query 사용법 찾아줘"
```

### 자동 오케스트레이션 (키워드 트리거)

특정 키워드를 사용하면 자동으로 오케스트레이션이 실행됩니다:

| 키워드 | 동작 | 실행 에이전트 |
|--------|------|---------------|
| `ultrawork` 또는 `ulw` | 최대 병렬 모드 | arch + canvas + index 동시 |
| `search` 또는 `찾아` | 검색 집중 모드 | index 단독 |
| `analyze` 또는 `분석` | 심층 분석 모드 | arch → index 순차 |

### Orchestrate Skill

`/orchestrate` 명령으로 복잡한 작업을 단계별로 위임:

```
/orchestrate 새로운 결제 기능 구현
```

스킬이 자동으로:
1. 작업을 분석하고 단계별로 분해
2. 적절한 에이전트에게 각 단계 할당
3. 진행 상황 추적 및 보고

---

## Python Hooks

`~/.claude/hooks/`에 설치되는 Python 기반 자동화 훅:

| 훅 | 트리거 | 기능 |
|----|--------|------|
| `collect_project_context.py` | SessionStart | 프로젝트 컨텍스트 자동 수집 |
| `recovery_wrapper.py` | SessionStart | 이전 세션 컨텍스트 복구 + 데이터 정리 |
| `context_saver_wrapper.py` | PostToolUse | 파일 수정, Todo 변경 시 컨텍스트 저장 |
| `checkpoint_wrapper.py` | /checkpoint 스킬 | 수동 체크포인트 생성 |
| `review_completion_wrapper.py` | PostToolUse (TodoWrite) | 작업 완료 시 Gemini로 코드 리뷰 |
| `review_test_wrapper.py` | PostToolUse (Bash) | 테스트 실행 후 결과 분석 |
| `completion_orchestrator.py` | - | 완료 작업 오케스트레이션 |
| `quota_monitor.py` | - | API 사용량 모니터링 |

### API 키 설정 (Hooks용)

Hooks가 외부 모델을 호출하려면 `~/.claude/hooks/api_keys.json` 파일에 API 키를 설정하세요:

```json
{
  "GEMINI_API_KEY": "your-gemini-api-key"
}
```

---

## Context Resilience Framework

`/compact` 명령 후 발생하는 문맥 손실 문제를 해결합니다.

### 문제점

Claude Code에서 `/compact`를 실행하면 대화 내역이 요약되면서 다음 정보들이 손실됩니다:

| 문제 | 증상 | 영향 |
|------|------|------|
| **Skills 망각** | CLAUDE.md, SKILL.md 내용을 잊음 | 프로젝트 규칙/컨벤션 무시 |
| **파일 경로 손실** | 어떤 파일을 수정 중이었는지 모름 | 작업 연속성 단절 |
| **실수 반복** | 이미 해결한 에러를 다시 범함 | 시간 낭비, 코드 품질 저하 |
| **결정사항 무시** | 합의한 설계 방향을 잊음 | 일관성 없는 구현 |

### 해결 전략 (3단계 계층)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Protected Context (자동)                          │
│  - 작업 디렉토리, 스킬 경로, 수정 파일 등 시스템 정보 보호      │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Semantic Anchors (자동)                           │
│  - "결정했어", "해결됨" 등 중요 순간 자동 감지 및 저장          │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Auto Recovery (자동)                              │
│  - 세션 시작 시 이전 컨텍스트 자동 복구 (14일 이내)            │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Protected Context

Claude가 도구를 사용할 때마다 자동으로 핵심 정보를 파일에 저장합니다.

**저장되는 정보:**
- `working_directory` - 현재 프로젝트 경로
- `active_skills` - 로드된 SKILL.md 경로 목록
- `active_files` - 수정 중인 파일 경로 (최대 30개)
- `pending_tasks` - 미완료 작업 목록 (최대 20개)
- `key_decisions` - 핵심 결정사항 (최대 20개)
- `resolved_errors` - 해결한 에러 요약 (최대 10개)

### Layer 2: Semantic Anchors

대화 내용에서 중요한 순간을 자동으로 감지하여 저장합니다.

| 앵커 타입 | 감지 키워드 (한국어) | 감지 키워드 (영어) |
|----------|---------------------|-------------------|
| **DECISION** | 결정, 선택, 이렇게 하자 | decided, choose, let's go with |
| **ERROR_RESOLVED** | 해결, 수정 완료, 고침 | fixed, resolved, working now |
| **USER_EXPLICIT** | 기억해, 중요:, 잊지 마 | remember, important:, note: |
| **FILE_MODIFIED** | (자동) 파일 생성/수정 시 | (자동) Edit/Write 도구 사용 시 |
| **CHECKPOINT** | /checkpoint 명령 또는 Todo 전체 완료 시 | 자동 생성 |

### Layer 3: Auto Recovery

새 세션이 시작되면 자동으로 이전 컨텍스트를 복구합니다 (14일 이내).

### /checkpoint 스킬

중요한 시점에 명시적으로 컨텍스트를 저장:

```
/checkpoint "인증 시스템 구현 완료, JWT + refresh token 방식"
```

---

## 도구 목록

| 도구 | 설명 |
|------|------|
| `background_task` | 백그라운드에서 전문 에이전트 실행 |
| `background_output` | 에이전트 상태 확인 및 결과 조회 |
| `background_cancel` | 에이전트 취소 |
| `list_tasks` | 전체 에이전트 조회 |
| `share_context` | 컨텍스트 공유 |
| `get_context` | 공유 컨텍스트 조회 |
| `suggest_agent` | 작업에 적합한 에이전트 추천 |

---

## 프로젝트 구조

```
cc-orchestrator/
├── src/                         # TypeScript 소스
│   ├── core/                    # 순수 비즈니스 로직
│   │   ├── agents/              # 에이전트 관리
│   │   ├── models/              # 모델 라우팅 및 프로바이더
│   │   ├── context/             # 컨텍스트 저장소
│   │   ├── orchestration/       # 오케스트레이션 엔진
│   │   └── prompts/             # 동적 프롬프트 빌더
│   ├── server/                  # MCP 프로토콜 처리
│   │   ├── tools/               # 도구 정의 및 스키마
│   │   └── handlers/            # 요청 핸들러
│   ├── types/                   # 타입 및 에러 정의
│   └── infrastructure/          # 로깅, 설정 로더
├── hooks/                       # Python Hooks (→ ~/.claude/hooks/)
├── skills/                      # Skills (→ ~/.claude/skills/)
├── templates/                   # 설정 템플릿
├── scripts/                     # 설치/삭제 스크립트
└── dist/                        # 빌드 결과
```

---

## 설정

### Provider 우선순위 설정

`~/.cco/config.json` 파일로 제공자 우선순위를 커스터마이징할 수 있습니다:

```json
{
  "providers": {
    "priority": ["anthropic", "google", "openai"]
  },
  "roles": {
    "arch": {
      "providers": ["anthropic", "openai"]
    },
    "index": {
      "providers": ["google", "anthropic"]
    }
  }
}
```

환경 변수로도 설정 가능:

```bash
# 전역 우선순위
export CCO_PROVIDER_PRIORITY=anthropic,google,openai

# 역할별 우선순위
export CCO_ARCH_PROVIDERS=anthropic,openai
```

### Context Resilience 설정

`~/.claude/hooks/config.json`:

```json
{
  "context_resilience": {
    "enabled": true,
    "auto_save": true,
    "auto_recover": true,
    "max_anchors": 50,
    "recovery_message_max_length": 2000,
    "cleanup": {
      "enabled": true,
      "session_retention_days": 14,
      "max_anchors_per_session": 50,
      "cleanup_interval_hours": 24
    }
  }
}
```

---

## 제거

```bash
npm run uninstall
```

삭제 옵션:
1. **전체 삭제** - 로컬 + Claude 설정
2. **로컬만 삭제** - .env + dist + node_modules
3. **Claude 설정만 삭제** - hooks, skills, desktop config

---

## 비용 참고

| 에이전트 | 비용 | 권장 용도 |
|----------|------|----------|
| `scout` | 무료 | 개발 중 테스트, 코드베이스 탐색 |
| `index` | 저렴 | 문서 검색, 구현 사례 조사 |
| `arch` | 비쌈 | 아키텍처 설계, 중요 의사결정 |

개발 중에는 `scout` 에이전트 사용을 권장합니다.

---

## 참고 자료

- [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode) - 영감을 준 프로젝트
- [MCP Protocol](https://modelcontextprotocol.io/) - Model Context Protocol 공식 문서
- [Claude Code](https://claude.ai/claude-code) - Claude Code 공식 페이지

---

## 라이선스

MIT License - 자유롭게 사용, 수정, 배포할 수 있습니다.
