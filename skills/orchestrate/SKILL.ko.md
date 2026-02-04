---
name: orchestrate
description: 멀티모델 오케스트레이션 - 멀티모델 에이전트 오케스트레이션 가이드
version: 2.1.0
author: CC Orchestrator
tags: [orchestration, multi-model, parallel, workflow]
---

# 멀티모델 오케스트레이션 가이드

이 가이드에 따라 멀티모델 에이전트를 오케스트레이션하세요.

---

## Phase 0: 의도 게이트 (BLOCKING)

### Step 0: 요청 분류

```
사용자 요청 수신
    ↓
[요청 유형 분류]
├─ Trivial        → 직접 도구만 사용 (에이전트 불필요)
├─ Explicit       → 지시대로 직접 실행
├─ Exploratory    → scout/index 병렬 실행
├─ Open-ended     → Phase 1로 (코드베이스 평가 필요)
├─ Implementation → 코딩 에이전트에 위임 (다중 파일 시 패턴 E)
├─ Research       → index 우선 실행
├─ Design/Review  → arch 상담
└─ Ambiguous      → 명확화 질문 1개만
```

### Step 1: 모호성 검증

```
├─ 단일 해석 가능        → 진행
├─ 여러 해석 + 비슷한 난이도 → 합리적 가정 후 진행
├─ 2배+ 난이도 차이      → 반드시 질문
└─ 핵심 정보 부족        → 반드시 질문
```

### Step 2: 검증 체크리스트

- [ ] 암묵적 가정 확인했는가?
- [ ] 검색 범위가 명확한가?
- [ ] 적절한 에이전트를 선택했는가?

---

## Phase 1: 코드베이스 평가 (Open-ended 작업만)

### 상태 분류 매트릭스

| 상태 | 시그널 | 행동 |
|------|--------|------|
| **Disciplined** | 일관된 패턴, 설정 존재 | 기존 스타일 엄격히 따름 |
| **Transition** | 혼합 패턴 | "어느 패턴 따를까요?" 질문 |
| **Legacy** | 일관성 없음 | "제안: [X] 적용할까요?" |
| **Greenfield** | 새 프로젝트 | 현대적 모범 사례 적용 |

---

## Phase 2: 실행

### 2A: 탐색 & 리서치

**도구 선택 우선순위:**

| 리소스 | 비용 | 사용 시점 |
|--------|------|-----------|
| Grep, Glob, Read | FREE | 범위 명확, 단순 검색 |
| `scout` agent | FREE | 코드베이스 탐색 (Task tool) |
| `index` agent | LOW | 외부 문서, API 리서치 (Task tool) |
| `frontend-developer` | FREE | 프론트엔드 구현 (React, CSS, 레이아웃) (Task tool) |
| `backend-architect` | FREE | 백엔드 구현 (API, 서비스) (Task tool) |
| `database-architect` | FREE | DB 스키마, 마이그레이션 (Task tool) |
| `cloud-architect` | FREE | 인프라, 배포 설정 (Task tool) |
| `docs-architect` | FREE | 코드 기반 기술 문서 (quill 무료 대안) (Task tool) |
| `architect-review` | FREE | 아키텍처 리뷰 (arch 무료 대안) (Task tool) |
| `general-purpose` | FREE | 범용 코딩, 전체 도구 접근 (Task tool) |
| `canvas` | MODERATE | UI/UX, 스타일링 (MCP) |
| `quill` | MODERATE | 기술 문서 (MCP) |
| `lens` | MODERATE | 이미지/PDF 분석 (MCP) |
| `arch` | EXPENSIVE | 아키텍처, 코드 리뷰 (MCP) |

**에이전트 라우팅 규칙 (CRITICAL):**

```
┌─────────────────────────────────────────────────────────────┐
│ CLAUDE CODE NATIVE AGENTS (Task tool) - FREE/LOW-COST       │
│                                                             │
│   scout  → Task(subagent_type="scout", prompt="...")     │
│              FREE: 코드베이스 탐색, 파일/함수 검색       │
│                                                             │
│   index  → Task(subagent_type="index", prompt="...")     │
│              LOW-COST: 외부 리서치 (WebSearch + Fetch)   │
│                                                             │
│ CODING AGENTS (Task tool) - FREE                            │
│   Edit/Write/Bash 사용 가능 - 실제 코드 수정 가능           │
│                                                             │
│   frontend-developer                                        │
│     → Task(subagent_type="frontend-developer", prompt="...") │
│       React, Next.js, CSS, 반응형 레이아웃, 컴포넌트       │
│                                                             │
│   backend-architect                                         │
│     → Task(subagent_type="backend-architect", prompt="...")  │
│       API 설계, 마이크로서비스, 서버 로직                   │
│                                                             │
│   database-architect                                        │
│     → Task(subagent_type="database-architect", prompt="...") │
│       스키마 모델링, 마이그레이션, 쿼리 최적화              │
│                                                             │
│   cloud-architect                                           │
│     → Task(subagent_type="cloud-architect", prompt="...")    │
│       AWS/Azure/GCP, IaC, 배포 설정                         │
│                                                             │
│   docs-architect                                            │
│     → Task(subagent_type="docs-architect", prompt="...")     │
│       코드 기반 기술 문서 (quill 무료 대안)                 │
│                                                             │
│   architect-review                                          │
│     → Task(subagent_type="architect-review", prompt="...")   │
│       아키텍처 리뷰, 클린 아키텍처 (arch 무료 대안)        │
│                                                             │
│   general-purpose                                           │
│     → Task(subagent_type="general-purpose", prompt="...")    │
│       모든 작업, 전체 도구 접근 (Edit, Write, Bash)         │
│                                                             │
│ MCP AGENTS (background_task) - PAID                         │
│                                                             │
│   arch   → background_task(agent="arch")   // OpenAI GPT-5.2│
│   canvas → background_task(agent="canvas") // Google Gemini │
│   quill  → background_task(agent="quill")  // Google Gemini │
│   lens   → background_task(agent="lens")   // Google Gemini │
└─────────────────────────────────────────────────────────────┘
```

**병렬 실행 패턴:**

```bash
# 올바른 방법: Native + MCP 혼합 병렬 실행
Task(subagent_type="scout", prompt="인증 패턴 찾기")      // FREE
background_task(agent="arch", prompt="보안 아키텍처 검토") // PAID (GPT-5.2)
// 둘 다 병렬 실행 - 즉시 다음 작업 계속

# 잘못된 방법: MCP는 scout/index 지원 안함
background_task(agent="scout", ...)  // ERROR - Task tool 사용
background_task(agent="index", ...)  // ERROR - Task tool 사용
```

**탐색 중단 조건:**
- 충분한 컨텍스트 확보됨
- 같은 정보가 반복적으로 나타남
- 2번 탐색해도 신규 정보 없음
- 직접적인 답변 발견됨

### 2B: 구현

**Todo 생성 규칙:**
- 2단계 이상 작업 → 반드시 생성
- 모호한 범위 → 반드시 생성 (생각 명확화)
- 사용자가 여러 항목 요청 → 반드시 생성

**워크플로우:**
1. 즉시 생성 (공지 없이)
2. 현재 작업 `in_progress`로 마킹
3. 완료 즉시 `completed`로 마킹
4. 배칭 금지 (한 번에 하나씩)

### 2C: 실패 복구

**3연속 실패 시:**
1. 모든 편집 중단
2. 마지막 정상 상태로 복원 (git checkout 등)
3. 시도한 내용 문서화
4. `arch` 상담
5. 사용자에게 상황 설명

---

## Phase 3: 완료 검증

**체크리스트:**
- [ ] 모든 todo 완료
- [ ] 타입 에러 없음 (npx tsc --noEmit)
- [ ] 빌드 통과 (있으면)
- [ ] 사용자 요청 완전히 충족

**정리:**
```
background_cancel(all=true)  // 모든 백그라운드 작업 취소
```

---

## 에이전트 선택 가이드

### 에이전트 역할표

**Claude Code Native Agents (Task tool) - FREE/LOW-COST:**

| 에이전트 | 호출 방법 | 용도 | 트리거 |
|----------|-----------|------|--------|
| `scout` | `Task(subagent_type="scout")` | 코드베이스 탐색, 파일/함수 검색 | "어디에", "찾아줘", "어떻게 동작" |
| `index` | `Task(subagent_type="index")` | 외부 문서, API, 모범 사례 (저렴) | 라이브러리명, "어떻게", 튜토리얼 |

**Claude Code 코딩 에이전트 (Task tool) - FREE:**

| 에이전트 | 호출 방법 | 용도 | 트리거 |
|----------|-----------|------|--------|
| `frontend-developer` | `Task(subagent_type="frontend-developer")` | React, Next.js, CSS, 반응형 레이아웃 | "UI 만들어", "컴포넌트 생성", "스타일", "페이지" |
| `backend-architect` | `Task(subagent_type="backend-architect")` | API 설계, 마이크로서비스, 서버 로직 | "API 만들어", "엔드포인트", "서비스", "미들웨어" |
| `database-architect` | `Task(subagent_type="database-architect")` | 스키마 모델링, 마이그레이션, 쿼리 | "스키마", "마이그레이션", "데이터베이스", "모델" |
| `cloud-architect` | `Task(subagent_type="cloud-architect")` | AWS/Azure/GCP, IaC, 배포 | "배포", "인프라", "CI/CD", "Docker" |
| `docs-architect` | `Task(subagent_type="docs-architect")` | 코드 기반 기술 문서 (quill 무료 대안) | "문서 작성", "가이드", "기술 문서" |
| `architect-review` | `Task(subagent_type="architect-review")` | 아키텍처 리뷰 (arch 무료 대안) | "아키텍처 리뷰", "설계 검토" |
| `general-purpose` | `Task(subagent_type="general-purpose")` | 범용 코딩, 전체 도구 접근 | 구현 작업 범용 |

**MCP Agents (background_task) - PAID:**

| 에이전트 | 모델 | 용도 | 비용 | 트리거 |
|----------|------|------|------|--------|
| `arch` | GPT-5.2 | 아키텍처, 전략, 코드 리뷰 | 높음 | 설계 결정, 복잡한 문제 |
| `canvas` | Gemini 3 | UI/UX, 스타일링, 컴포넌트 | 중간 | Visual 변경, CSS, 애니메이션 |
| `quill` | Gemini 3 | 기술 문서, README, API 문서 | 중간 | 문서화 요청 |
| `lens` | Gemini 3 | 이미지, PDF, 스크린샷 분석 | 중간 | 시각 자료 분석 |

### 위임 테이블

| 도메인 | 위임 대상 | 트리거 키워드 |
|--------|-----------|---------------|
| Frontend UI/UX | `canvas` | style, color, animation, layout, responsive |
| 외부 리서치 | `index` (저렴) | 라이브러리명, API, "어떻게 하는지", 모범 사례 |
| 아키텍처 | `arch` | 설계, 구조, 패턴 선택, 트레이드오프 |
| 코드 리뷰 | `arch` | 리뷰, 검토, 개선점 |
| 문서화 | `quill` | README, 문서, 설명서, API docs |
| 이미지/PDF | `lens` | 스크린샷, 이미지, PDF, 다이어그램 |
| 프론트엔드 코딩 | `frontend-developer` (native) | 빌드, 컴포넌트, React, 페이지, 레이아웃 |
| 백엔드 코딩 | `backend-architect` (native) | API, 엔드포인트, 서비스, 서버, 미들웨어 |
| DB 작업 | `database-architect` (native) | 스키마, 마이그레이션, 모델, 쿼리 |
| 인프라 | `cloud-architect` (native) | 배포, Docker, CI/CD, 인프라, 클라우드 |
| 기술 문서 (무료) | `docs-architect` (native) | 문서, 가이드 (quill 대비 비용 절감) |
| 아키텍처 리뷰 (무료) | `architect-review` (native) | 리뷰, 검토 (arch 대비 비용 절감) |
| 범용 코딩 | `general-purpose` (native) | 구현, 코드, 빌드 (범용) |

### Frontend 위임 게이트 (BLOCKING)

**Visual 키워드 감지 시 반드시 위임:**
```
style, className, tailwind, color, background, border,
shadow, margin, padding, width, height, flex, grid,
animation, transition, hover, responsive, CSS
```

| 변경 유형 | 예시 | 액션 |
|-----------|------|------|
| Visual/UI | 색상, 간격, 애니메이션 | **반드시 위임** |
| Pure Logic | API 호출, 상태 관리 | 직접 처리 |
| Mixed | Visual + Logic 둘 다 | 분리해서 처리 |

---

## 위임 프롬프트 작성법

**필수 7개 섹션:**

```markdown
## TASK
[원자적 목표 - 액션 1개만]

## EXPECTED
[구체적 결과물 + 성공 기준]

## REQUIRED_TOOLS
[사용할 도구 화이트리스트]

## MUST_DO
[명시적 필수사항]

## MUST_NOT_DO
[금지 액션 - rogue behavior 차단]

## CONTEXT
[파일 경로, 기존 패턴, 제약사항]

## SUCCESS_CRITERIA
[완료 검증 기준]
```

---

## 실행 패턴

### 패턴 A: 탐색 + 구현

```
1. Task(subagent_type="index", prompt="레퍼런스 검색...")  // 병렬 (저렴)
2. 동시에 기본 구현 시작
3. index 결과로 구현 보강
```

### 패턴 B: 설계 검토

```
1. 초안 작성
2. background_task(arch, "아키텍처 검토...")
3. 피드백 반영
```

### 패턴 C: 다중 관점 수집

```
1. background_task(arch, "아키텍처 관점...")    // 병렬
2. Task(subagent_type="index", prompt="업계 사례...")      // 병렬 (저렴)
3. background_task(canvas, "UX 관점...")       // 병렬
4. 세 결과 통합
```

### 패턴 D: 복잡한 구현

```
1. arch로 설계 방향 확정
2. index으로 사례 조사 (병렬)
3. 구현 진행
4. arch로 코드 리뷰
```

### 패턴 E: 병렬 구현

```
1. Task(subagent_type="scout", prompt="코드베이스 구조 분석")        // FREE
2. background_task(arch, "구현 계획 설계...")                        // GPT-5.2
   또는 Task(subagent_type="architect-review", prompt="계획 설계...") // FREE 대안
3. background_output(task_id, block=true)로 설계 결과 수집
4. 병렬 코딩 위임 (한 메시지에서 여러 Task 호출):
   Task(subagent_type="frontend-developer", prompt="[설계 컨텍스트] UI 구현...")
   Task(subagent_type="backend-architect", prompt="[설계 컨텍스트] API 구현...")
   // 각 에이전트는 Read/Grep/Glob + Edit/Write/Bash 접근 가능
5. 모든 결과 수집
6. 통합 검증, 충돌 시 수정
```

**컨텍스트 전달 (CRITICAL):**
```
위임 프롬프트 구조를 사용하여 설계 출력을 각 워커에 포함:

## CONTEXT
[설계 계획 출력을 여기에 붙여넣기]

## YOUR SCOPE
[이 에이전트가 다룰 파일/디렉토리 - 절대 경로 사용]

## MUST_NOT_DO
- 담당 범위 밖의 파일 수정 금지
- 다른 에이전트에 할당된 작업 중복 금지
```

**파일 범위 지정 (충돌 방지):**
```
├─ frontend-developer → src/components/, src/pages/, src/styles/
├─ backend-architect  → src/api/, src/services/, src/middleware/
├─ database-architect → src/models/, src/migrations/, prisma/
├─ cloud-architect    → infra/, docker/, .github/workflows/
├─ docs-architect     → docs/
└─ architect-review   → 분석만 수행 (파일 수정 없음)
```

### 패턴 E-iso: Git Worktree 격리 병렬 구현

여러 에이전트가 같은 파일을 수정해야 하거나 안전한 롤백이 필요할 때:

```
1-3. 패턴 E와 동일
4. Git worktree 생성 (메인 세션이 Bash로 실행):
   git worktree add ../wt-frontend -b swarm/frontend
   git worktree add ../wt-backend -b swarm/backend
5. 절대 경로 기반 위임 (Task tool에 cwd 파라미터 없음):
   Task(subagent_type="frontend-developer", prompt="
     작업 디렉토리: {abs_path}/wt-frontend
     모든 파일은 {abs_path}/wt-frontend 기준 절대 경로 사용.
     Bash 명령은 반드시 cd {abs_path}/wt-frontend && 로 시작.
     [설계 컨텍스트]...")
   Task(subagent_type="backend-architect", prompt="
     작업 디렉토리: {abs_path}/wt-backend
     모든 파일은 {abs_path}/wt-backend 기준 절대 경로 사용.
     Bash 명령은 반드시 cd {abs_path}/wt-backend && 로 시작.
     [설계 컨텍스트]...")
6. 결과 수집 후 머지:
   git merge swarm/frontend
   git merge swarm/backend
7. 정리:
   git worktree remove ../wt-frontend
   git worktree remove ../wt-backend
   git branch -d swarm/frontend swarm/backend
```

**제약사항:**
- Task tool에 `cwd` 파라미터 없음 (Feature Request #12748)
- 워크어라운드: 프롬프트에 절대 경로 + Bash에 `cd path &&` 접두사
- 설정에 `additionalDirectories` 추가 필요할 수 있음

---

## 비용 최적화

```plaintext
FREE (Claude Code Task tool):
├─ 단순 검색             → Grep, Glob (항상 무료 우선)
├─ 코드베이스 탐색       → Task(subagent_type="scout")
├─ 프론트엔드 코딩       → Task(subagent_type="frontend-developer")
├─ 백엔드 코딩           → Task(subagent_type="backend-architect")
├─ DB 작업               → Task(subagent_type="database-architect")
├─ 인프라                → Task(subagent_type="cloud-architect")
├─ 기술 문서 (무료)      → Task(subagent_type="docs-architect")
├─ 아키텍처 리뷰 (무료)  → Task(subagent_type="architect-review")
└─ 범용 작업             → Task(subagent_type="general-purpose")

LOW-COST (Claude Code Task tool):
└─ 외부 리서치           → Task(subagent_type="index")

PAID (MCP external APIs):
├─ 아키텍처 결정         → arch (GPT-5.2, expensive)
├─ UI/UX 작업           → canvas (Gemini, moderate)
├─ 문서화               → quill (Gemini, moderate)
└─ 이미지/PDF 분석      → lens (Gemini, moderate)
```

**원칙:**
1. 무료 도구로 해결 가능하면 에이전트 호출 안함
2. 저렴한 에이전트(index)로 충분하면 비싼 에이전트 안씀
3. 병렬 실행으로 시간 최적화

---

## 금지 사항 (Hard Blocks)

### 절대 하지 말 것

| 카테고리 | 금지 사항 |
|----------|-----------|
| Type Safety | `as any`, `@ts-ignore` 사용 |
| Error Handling | 빈 catch 블록 |
| Testing | 실패 테스트 삭제로 "통과" 처리 |
| Search | 오타 하나 찾으려고 에이전트 호출 |
| Debugging | 무작위 수정 (shotgun debugging) |
| Frontend | Visual 변경 직접 처리 (위임 필수) |
| Commit | 명시적 요청 없이 커밋 |

### Anti-Patterns

```
❌ 코드 읽지 않고 추측
❌ 실패 상태 방치 후 다음 작업
❌ 순차적 에이전트 호출 (병렬 가능할 때)
❌ 불필요한 상태 업데이트 메시지
❌ 과도한 칭찬 ("Great question!")
```

---

## 통신 스타일

### 간결함 원칙

```
❌ "I'm on it...", "Let me start by..."
✅ 즉시 작업 시작

❌ 작업 설명 (요청 없으면)
✅ 결과만 제시

❌ "Great question!", "Excellent choice!"
✅ 직접 본론으로
```

### 우려사항 전달

```
"[관찰] 발견했습니다. [이유]로 [문제]가 발생할 수 있습니다.
대안: [제안]
원래대로 할까요, 대안을 시도할까요?"
```

---

## 도구 레퍼런스

```
background_task(agent, prompt, description?, priority?)
  → task_id 반환, 즉시 실행 시작

background_output(task_id, block?, timeout_ms?)
  → block=false: 즉시 상태 반환
  → block=true: 완료까지 대기

background_cancel(task_id?, all?)
  → task_id: 특정 작업 취소
  → all=true: 모든 작업 취소

list_tasks(filter?)
  → 현재 작업 목록 조회

share_context(key, value, scope?, ttl_seconds?)
  → 에이전트 간 컨텍스트 공유

get_context(key, scope?)
  → 공유된 컨텍스트 조회
```

---

## 요청 처리 흐름도

```
사용자 요청: "$ARGUMENTS"

[Step 1: 분류]
├─ Trivial?      → 직접 처리
├─ Research?     → index 실행 (저렴)
├─ Design?       → arch 상담
├─ UI/Visual?    → canvas 위임
├─ Complex?      → 다중 에이전트 병렬
└─ Ambiguous?    → 질문 1개

[Step 2: 실행]
├─ 병렬 가능한 작업 식별
├─ background_task로 동시 실행
├─ 직접 처리 가능한 건 바로 처리
└─ 결과 수집 및 통합

[Step 3: 검증]
├─ 요청 완전히 충족?
├─ 에러 없음?
└─ 정리 완료?

[Step 4: 응답]
├─ 결과 전달
└─ background_cancel(all=true)
```

위 가이드에 따라 요청을 처리하세요.
