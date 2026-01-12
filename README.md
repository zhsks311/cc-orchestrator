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

### 1. 설치 (원라인)

```bash
npx create-cc-orchestrator
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
npx create-cc-orchestrator

# 수동 설치 (미설치 항목만)
npm run setup

# 모든 항목 재설치
npm run setup -- --force

# 업데이트 (최신 버전으로)
npm run update

# 업데이트 확인만
npm run update -- --check

# npx로 업데이트
npx create-cc-orchestrator --upgrade
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
| `recovery_wrapper.py` | SessionStart | 이전 세션 컨텍스트 복구 + 데이터 정리 |
| `context_saver_wrapper.py` | PostToolUse (Edit/Write/TodoWrite) | 파일 수정, Todo 변경 시 컨텍스트 저장 |
| `checkpoint_wrapper.py` | /checkpoint 스킬 | 수동 체크포인트 생성 |
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

### Context Resilience Framework

`/compact` 명령 후 발생하는 문맥 손실 문제를 해결합니다.

#### 문제점

Claude Code에서 `/compact`를 실행하면 대화 내역이 요약되면서 다음 정보들이 손실됩니다:

| 문제 | 증상 | 영향 |
|------|------|------|
| **Skills 망각** | CLAUDE.md, SKILL.md 내용을 잊음 | 프로젝트 규칙/컨벤션 무시 |
| **파일 경로 손실** | 어떤 파일을 수정 중이었는지 모름 | 작업 연속성 단절 |
| **실수 반복** | 이미 해결한 에러를 다시 범함 | 시간 낭비, 코드 품질 저하 |
| **결정사항 무시** | 합의한 설계 방향을 잊음 | 일관성 없는 구현 |

#### 해결 전략

3가지 계층으로 문맥을 보호합니다:

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

---

#### Layer 1: Protected Context (핵심 정보 자동 보호)

Claude가 도구를 사용할 때마다 자동으로 핵심 정보를 파일에 저장합니다.

**동작 방식:**
```
사용자: "auth.py 파일 수정해줘"
    ↓
Claude: Edit 도구 사용
    ↓
PostToolUse Hook 실행 → context_saver_wrapper.py
    ↓
~/.claude/hooks/state/{session}_protected.json 에 저장
```

**저장되는 정보:**

| 필드 | 설명 | 저장 시점 |
|------|------|----------|
| `working_directory` | 현재 프로젝트 경로 | 세션 시작 |
| `active_skills` | 로드된 SKILL.md 경로 목록 | 세션 시작 |
| `active_files` | 수정 중인 파일 경로 (최대 30개) | Edit, Write 사용 시 |
| `pending_tasks` | 미완료 작업 목록 (최대 20개) | TodoWrite 사용 시 |
| `key_decisions` | 핵심 결정사항 (최대 20개) | 키워드 감지 시 |
| `resolved_errors` | 해결한 에러 요약 (최대 10개) | 키워드 감지 시 |
| `user_intent` | 사용자의 원래 목적 | 명시적 설정 시 |

**저장 파일 예시:**
```json
{
  "session_id": "abc123",
  "working_directory": "/home/user/my-project",
  "active_skills": ["/home/user/.claude/skills/commit/SKILL.md"],
  "active_files": ["src/auth.py", "src/utils.py"],
  "pending_tasks": ["API 엔드포인트 구현", "테스트 작성"],
  "key_decisions": ["JWT 인증 방식 선택", "PostgreSQL 사용"],
  "resolved_errors": ["ImportError: bcrypt 패키지 설치로 해결"]
}
```

---

#### Layer 2: Semantic Anchors (중요 순간 자동 포착)

대화 내용에서 중요한 순간을 자동으로 감지하여 저장합니다.

**감지 패턴:**

| 앵커 타입 | 감지 키워드 (한국어) | 감지 키워드 (영어) |
|----------|---------------------|-------------------|
| **DECISION** | 결정, 선택, 이렇게 하자, 방법으로 | decided, choose, let's go with |
| **ERROR_RESOLVED** | 해결, 수정 완료, 고침 | fixed, resolved, working now |
| **USER_EXPLICIT** | 기억해, 중요:, 잊지 마 | remember, important:, note: |
| **FILE_MODIFIED** | (자동) 파일 생성/수정 시 | (자동) Edit/Write 도구 사용 시 |
| **CHECKPOINT** | /checkpoint 명령 또는 Todo 전체 완료 시 | 자동 생성 |

**자동 체크포인트:**

Todo 목록의 모든 항목이 `completed` 상태가 되면 자동으로 체크포인트가 생성됩니다.
```
Todo 전체 완료 → CHECKPOINT 앵커 자동 생성 (importance: 5)
```

**동작 예시:**
```
사용자: "JWT로 하기로 결정했어"
    ↓
Semantic Anchor 감지: DECISION 타입
    ↓
앵커 저장: {
  "type": "decision",
  "content": "JWT로 하기로 결정했어",
  "importance": 3,
  "timestamp": "2025-01-12T10:30:00"
}
```

**중요도 자동 계산:**
- 사용자 명시적 마킹 (`기억해`, `important:`): 5점
- 체크포인트: 5점
- 에러 해결: 4점
- 결정사항: 3점
- 파일 수정: 2점

중요도가 높은 앵커는 정리 시 우선 보존됩니다.

---

#### Layer 3: Auto Recovery (자동 복구)

새 세션이 시작되면 자동으로 이전 컨텍스트를 복구합니다.

**동작 흐름:**
```
Claude Code 시작 또는 /compact 후
    ↓
SessionStart Hook → recovery_wrapper.py
    ↓
1. 같은 작업 디렉토리의 최근 세션 찾기 (14일 이내)
2. Protected Context 로드
3. Semantic Anchors 로드 (최근 10개)
4. 복구 메시지 생성
    ↓
시스템 메시지로 Claude에게 전달
```

**복구 메시지 예시:**
```markdown
## 🔄 이전 컨텍스트 복구됨

### 작업 목적
사용자 인증 시스템 구현

### 활성 스킬
- /home/user/.claude/skills/commit/SKILL.md

### 핵심 결정사항
- JWT 인증 방식 선택
- PostgreSQL 사용

### 해결한 에러
- ImportError: bcrypt 패키지 설치로 해결

### 진행 중인 작업
- [ ] API 엔드포인트 구현
- [ ] 테스트 작성

### 작업 중인 파일
- src/auth.py
- src/utils.py

---
⚠️ 파일 내용은 다시 읽어야 합니다.
```

---

#### /checkpoint 스킬 (수동 저장)

중요한 시점에 명시적으로 컨텍스트를 저장합니다.

**사용법:**
```
/checkpoint "인증 시스템 구현 완료, JWT + refresh token 방식"
```

**동작:**
1. 현재 Protected Context 저장
2. 메시지와 함께 CHECKPOINT 타입 앵커 생성 (importance: 5)
3. 현재 작업 파일, Todo 상태 등 컨텍스트 함께 저장

**활용 시나리오:**
- 큰 기능 구현 완료 후
- 중요한 설계 결정 후
- 긴 디버깅 세션 해결 후
- `/compact` 실행 전

---

#### 데이터 관리 및 정리

디스크 공간을 효율적으로 관리하기 위해 자동 정리됩니다.

**정리 정책:**

| 항목 | 제한 | 정리 방식 |
|------|------|----------|
| 세션 파일 | 14일 | 기간 초과 시 삭제 |
| 앵커 개수 | 세션당 50개 | 중요도 낮은 것부터 삭제 |

**정리 실행 시점:**
- 세션 시작 시 자동 (24시간 주기)

**설정 파일:** `~/.claude/hooks/config.json`

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
