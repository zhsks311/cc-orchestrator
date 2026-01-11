# CC Orchestrator - Claude Code Multi-Model Orchestrator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Claude Code에서 GPT-5.2, Gemini 3 Pro, Claude Sonnet 4.5 등 다양한 LLM을 **병렬로 활용**하는 MCP 서버입니다.

> [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode)의 멀티모델 오케스트레이션 개념을 Claude Code 환경에서 구현한 프로젝트입니다.

## 주요 기능

- **멀티모델 병렬 실행** - GPT, Gemini, Claude를 동시에 활용
- **전문 에이전트 시스템** - 역할별 최적화된 모델 자동 선택
- **DAG 기반 오케스트레이션** - 의존성 관리 및 자동 워크플로우
- **키워드 트리거** - `ultrawork`, `분석`, `찾아` 등으로 자동 실행
- **컨텍스트 공유** - 에이전트 간 결과 전달
- **Python Hooks** - 코드 리뷰, 완료 오케스트레이션 자동화
- **Orchestrate Skill** - `/orchestrate` 명령으로 복잡한 작업 위임

---

## 역할-모델 매핑

| 역할 | 모델 | Fallback | 용도 |
|------|------|----------|------|
| **oracle** | GPT-5.2 | GPT-4o | 아키텍처 설계, 전략적 의사결정, 코드 리뷰 |
| **frontend-engineer** | Gemini 3 Pro | Gemini 2.5 Flash | UI/UX 디자인, 프론트엔드 구현 |
| **librarian** | Claude Sonnet 4.5 | Claude Sonnet 4 | 문서 검색, 코드베이스 분석, 구현 사례 조사 |
| **document-writer** | Gemini 3 Pro | Gemini 2.5 Flash | 기술 문서 작성, README, API 문서 |
| **multimodal-analyzer** | Gemini 2.5 Flash | Gemini 2.0 Flash | 이미지, PDF, 스크린샷 분석 |

### Cross-Provider Fallback

API 키가 없거나 제공자 장애 시 **다른 제공자로 자동 전환**됩니다:

```
oracle: OpenAI → Anthropic → Google
librarian: Anthropic → Google → OpenAI
frontend-engineer: Google → Anthropic → OpenAI
document-writer: Google → Anthropic → OpenAI
multimodal-analyzer: Google → Anthropic → OpenAI
explore: Anthropic (무료, Claude Sonnet)
```

**예시:** OpenAI API 키만 있는 경우
- `oracle` → OpenAI 사용 ✓
- `librarian` → Anthropic 없음 → OpenAI로 fallback ⚠
- `frontend-engineer` → Google 없음 → OpenAI로 fallback ⚠

설치 시 에이전트 가용성을 자동으로 표시합니다.

---

## 빠른 시작

### 1. 설치

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

### 설치 옵션

```bash
# 설치 (미설치 항목만 자동 설치)
npm run setup

# 모든 항목 재설치
npm run setup -- --force
```

### Provider 우선순위 설정

`~/.cco/config.json` 파일로 제공자 우선순위를 커스터마이징할 수 있습니다:

```json
{
  "providers": {
    "priority": ["anthropic", "google", "openai"]
  },
  "roles": {
    "oracle": {
      "providers": ["anthropic", "openai"]
    },
    "librarian": {
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
export CCO_ORACLE_PROVIDERS=anthropic,openai
```

---

## 추가 기능 (Hooks & Skills)

### Python Hooks

`~/.claude/hooks/`에 설치되는 Python 기반 자동화 훅:

| 훅 | 트리거 | 기능 |
|----|--------|------|
| `collect_project_context.py` | SessionStart | 프로젝트 컨텍스트 자동 수집 |
| `review_completion_wrapper.py` | PostToolUse (TodoWrite) | 작업 완료 시 Gemini로 코드 리뷰 |
| `review_test_wrapper.py` | PostToolUse (Bash) | 테스트 실행 후 결과 분석 |
| `completion_orchestrator.py` | - | 완료 작업 오케스트레이션 |
| `quota_monitor.py` | - | API 사용량 모니터링 |

### Orchestrate Skill

`/orchestrate` 명령으로 복잡한 작업을 단계별로 위임:

```
/orchestrate 새로운 결제 기능 구현
```

스킬이 자동으로:
1. 작업을 분석하고 단계별로 분해
2. 적절한 에이전트에게 각 단계 할당
3. 진행 상황 추적 및 보고

### API 키 설정 (Hooks용)

Hooks가 외부 모델을 호출하려면 `~/.claude/hooks/api_keys.json` 파일에 API 키를 설정하세요:

```json
{
  "GEMINI_API_KEY": "your-gemini-api-key"
}
```

---

## 사용 방법

### 개별 에이전트 호출

```
"oracle한테 이 프로젝트 아키텍처 리뷰해달라고 해"
"frontend-engineer한테 로그인 폼 컴포넌트 만들어줘"
"librarian한테 React Query 사용법 찾아줘"
```

### 자동 오케스트레이션 (키워드 트리거)

| 키워드 | 동작 | 실행 에이전트 |
|--------|------|---------------|
| `ultrawork` 또는 `ulw` | 최대 병렬 모드 | oracle + frontend + librarian 동시 |
| `search` 또는 `찾아` | 검색 집중 모드 | librarian 단독 |
| `analyze` 또는 `분석` | 심층 분석 모드 | oracle → librarian 순차 |

---

## 도구 목록

| 도구 | 설명 |
|------|------|
| `spawn_agent` | 백그라운드에서 전문 에이전트 실행 |
| `check_agent` | 에이전트 상태 확인 |
| `wait_agent` | 에이전트 완료 대기 |
| `list_agents` | 전체 에이전트 조회 |
| `cancel_agent` | 에이전트 취소 |
| `share_context` | 컨텍스트 공유 |
| `get_shared_context` | 공유 컨텍스트 조회 |
| `auto_orchestrate` | 자동 오케스트레이션 |

---

## 프로젝트 구조

```
cc-orchestrator/
├── src/                         # TypeScript 소스
├── hooks/                       # Python Hooks (→ ~/.claude/hooks/)
├── skills/                      # Skills (→ ~/.claude/skills/)
├── templates/                   # 설정 템플릿
├── scripts/                     # 설치/삭제 스크립트
└── dist/                        # 빌드 결과
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

## 참고

- [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [Claude Code](https://claude.ai/claude-code)

## 라이선스

MIT
