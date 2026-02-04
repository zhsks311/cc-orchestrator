# Plan: Add Parallel Coding Agent Patterns to Orchestrate Skill

## Goal

Enable the orchestrate skill to leverage Claude Code's built-in coding subagents for **actual parallel coding**.

## Motivation (Why This Change Is Needed)

Current limitations of the orchestrate skill:
- MCP agents (arch/canvas/quill/lens) can only produce **text responses** and cannot modify files
- Even after arch completes a design, **actual coding is done sequentially** by the main Claude Code session
- No pattern is defined for working on multiple areas (frontend/backend/DB) simultaneously

Claude Code's Task tool already has built-in **coding-capable subagent_types** like `cco-frontend-developer`, `cco-backend-architect`, etc., but they are not mentioned in the orchestrate skill and thus go unused.

This change enables:
1. **Parallel coding**: After arch designs, frontend/backend/DB agents write code simultaneously
2. **Cost savings**: Coding agents are FREE (Claude Code quota), providing free alternatives to PAID MCP agents
3. **File conflict prevention**: Two strategies — directory scope separation (basic) + git worktree isolation (advanced)
4. **Zero runtime code changes**: No MCP server code changes (skill docs + setup guidance only)

## Files to Modify

- `skills/orchestrate/SKILL.md`
- `skills/orchestrate/SKILL.ko.md`
- `scripts/setup.mjs`

## Coding Agents to Add (11)

> **Note:** These agents are project-defined (not Claude Code built-in). They are installed to `~/.claude/agents/` via `npm run setup`.

All invoked via `Task(subagent_type="name")`. FREE. Can use Edit/Write/Bash.

| Agent | Purpose | Trigger Keywords |
|-------|---------|-----------------|
| `cco-frontend-developer` | React, Next.js, CSS, layouts | component, page, style, UI |
| `cco-backend-architect` | APIs, microservices, server logic | API, endpoint, service, middleware |
| `cco-database-architect` | Schema, migrations, queries | schema, migration, model, database |
| `cco-cloud-architect` | AWS/Azure/GCP, IaC, deployment | deploy, Docker, CI/CD, infra |
| `cco-docs-architect` | Technical docs from code (native quill alternative) | docs, guide, documentation |
| `cco-architect-review` | Architecture review (native arch alternative) | review, inspect, architecture |
| `cco-blockchain-developer` | Web3, smart contracts, DeFi | blockchain, smart contract, Web3 |
| `cco-graphql-architect` | GraphQL federation, schema design | GraphQL, schema, federation |
| `cco-hybrid-cloud-architect` | Multi-cloud, hybrid infrastructure | hybrid cloud, multi-cloud, edge |
| `cco-kubernetes-architect` | K8s, GitOps, cloud-native platform | kubernetes, k8s, GitOps, helm |
| `general-purpose` | General coding, full tool access | implement, build (catch-all) |

---

## Todo List + Specific Changes

### SKILL.md (English)

#### 1-EN: Frontmatter version bump

L4: `version: 2.0.0` → `version: 2.1.0`

#### 2-EN: Add Implementation to Phase 0 request classification

Insert before L27 (`├─ Research`):
```
├─ Implementation  → Delegate to coding agents (Pattern F for multi-file)
```

#### 3-EN: Add coding agents to tool selection priority table

Insert below L72 (`| index agent |`), above L73 (`| canvas |`):
```markdown
| `cco-frontend-developer` | FREE | Frontend implementation (React, CSS, layouts) (Task tool) |
| `cco-backend-architect` | FREE | Backend implementation (APIs, services) (Task tool) |
| `cco-database-architect` | FREE | DB schema, migrations (Task tool) |
| `cco-cloud-architect` | FREE | Infrastructure, deployment configs (Task tool) |
| `cco-docs-architect` | FREE | Technical docs from code (quill free alternative) (Task tool) |
| `cco-architect-review` | FREE | Architecture review (arch free alternative) (Task tool) |
| `general-purpose` | FREE | Any coding task, full tool access (Task tool) |
```

#### 4-EN: Add CODING AGENTS section to agent routing rules box

Insert below L88 (end of index block), above L90 (MCP AGENTS start):
```
│                                                             │
│ CODING AGENTS (Task tool) - FREE                            │
│   Can Edit/Write/Bash - actual code modification capable    │
│                                                             │
│   frontend-developer                                        │
│     → Task(subagent_type="frontend-developer", prompt="...") │
│       React, Next.js, CSS, responsive layouts, components   │
│                                                             │
│   backend-architect                                         │
│     → Task(subagent_type="backend-architect", prompt="...")  │
│       API design, microservices, server logic               │
│                                                             │
│   database-architect                                        │
│     → Task(subagent_type="database-architect", prompt="...") │
│       Schema modeling, migrations, query optimization       │
│                                                             │
│   cloud-architect                                           │
│     → Task(subagent_type="cloud-architect", prompt="...")    │
│       AWS/Azure/GCP, IaC, deployment configs                │
│                                                             │
│   docs-architect                                            │
│     → Task(subagent_type="docs-architect", prompt="...")     │
│       Technical docs from codebase (native quill alternative) │
│                                                             │
│   architect-review                                          │
│     → Task(subagent_type="architect-review", prompt="...")   │
│       Architecture review, clean arch (native arch alternative)│
│                                                             │
│   general-purpose                                           │
│     → Task(subagent_type="general-purpose", prompt="...")    │
│       Any task, full tool access (Edit, Write, Bash)        │
│                                                             │
```

#### 5-EN: Add coding agent sub-table to agent role table

Insert below L166 (end of scout/index table), above L168 (MCP Agents start):
```markdown
**Claude Code Coding Agents (Task tool) - FREE:**

| Agent | Invocation | Purpose | Triggers |
|-------|------------|---------|----------|
| `cco-frontend-developer` | `Task(subagent_type="frontend-developer")` | React, Next.js, CSS, responsive layouts | "build UI", "create component", "style", "page layout" |
| `cco-backend-architect` | `Task(subagent_type="backend-architect")` | API design, microservices, server logic | "create API", "endpoint", "service layer", "middleware" |
| `cco-database-architect` | `Task(subagent_type="database-architect")` | Schema modeling, migrations, queries | "schema", "migration", "database", "model" |
| `cco-cloud-architect` | `Task(subagent_type="cloud-architect")` | AWS/Azure/GCP, IaC, deployment | "deploy", "infrastructure", "CI/CD", "Docker" |
| `cco-docs-architect` | `Task(subagent_type="docs-architect")` | Technical docs from code (native quill alternative) | "document", "guide", "technical docs" |
| `cco-architect-review` | `Task(subagent_type="architect-review")` | Architecture review (native arch alternative) | "review architecture", "design review", "clean arch" |
| `general-purpose` | `Task(subagent_type="general-purpose")` | Any coding task, full tool access | Catch-all for implementation tasks |
```

#### 6-EN: Add coding domains to delegation table

Insert below L187 (Image/PDF row):
```markdown
| Frontend coding | `cco-frontend-developer` (native) | build, create component, React, page, layout |
| Backend coding | `cco-backend-architect` (native) | API, endpoint, service, server, middleware |
| Database work | `cco-database-architect` (native) | schema, migration, model, query, database |
| Infrastructure | `cco-cloud-architect` (native) | deploy, Docker, CI/CD, infra, cloud |
| Technical docs (free) | `cco-docs-architect` (native) | document, guide (cost saving over quill) |
| Architecture review (free) | `cco-architect-review` (native) | review, inspect (cost saving over arch) |
| General coding | `general-purpose` (native) | implement, code, build (catch-all) |
```

#### 7-EN: Add Pattern F (basic parallel implementation)

Insert after Pattern E (L271-277) code block, before `---` (L279):
```markdown
### Pattern F: Parallel Implementation

\```
1. Task(subagent_type="scout", prompt="Analyze codebase structure")     // FREE
2. background_task(arch, "Design implementation plan...")                // GPT-5.2
   OR Task(subagent_type="architect-review", prompt="Design plan...")   // FREE alternative
3. Collect design via background_output(task_id, block=true)
4. Parallel coding delegation (single message, multiple Task calls):
   Task(subagent_type="frontend-developer", prompt="[design context] Implement UI...")
   Task(subagent_type="backend-architect", prompt="[design context] Implement API...")
   // Each agent has Read/Grep/Glob + Edit/Write/Bash access
5. Collect all results
6. Verify integration, fix conflicts if any
\```

**Context Passing (CRITICAL):**
\```
Include design output in each worker prompt using delegation structure:

## CONTEXT
[Paste design plan output here]

## YOUR SCOPE
[Only files/directories this agent should touch - use absolute paths]

## MUST_NOT_DO
- Do NOT modify files outside your scope
- Do NOT duplicate work assigned to other agents
\```

**File Scope Assignment (prevent conflicts):**
\```
├─ frontend-developer → src/components/, src/pages/, src/styles/
├─ backend-architect  → src/api/, src/services/, src/middleware/
├─ database-architect → src/models/, src/migrations/, prisma/
├─ cloud-architect    → infra/, docker/, .github/workflows/
├─ docs-architect     → docs/
└─ architect-review   → Analysis only (no file modifications)
\```
```

#### 8-EN: Add Pattern F-iso (git worktree isolation)

Insert right after Pattern F:
```markdown
### Pattern F-iso: Parallel Implementation with Git Worktree Isolation

Use when multiple agents need to modify overlapping files, or when safe rollback is required:

\```
1-3. Same as Pattern F
4. Create git worktrees (main session runs via Bash):
   git worktree add ../wt-frontend -b swarm/frontend
   git worktree add ../wt-backend -b swarm/backend
5. Delegate with absolute paths (Task tool has no cwd parameter):
   Task(subagent_type="frontend-developer", prompt="
     Working directory: {abs_path}/wt-frontend
     Use absolute paths based on {abs_path}/wt-frontend for all file ops.
     Prefix all Bash commands with: cd {abs_path}/wt-frontend &&
     [design context]...")
   Task(subagent_type="backend-architect", prompt="
     Working directory: {abs_path}/wt-backend
     Use absolute paths based on {abs_path}/wt-backend for all file ops.
     Prefix all Bash commands with: cd {abs_path}/wt-backend &&
     [design context]...")
6. Merge results:
   git merge swarm/frontend
   git merge swarm/backend
7. Cleanup:
   git worktree remove ../wt-frontend
   git worktree remove ../wt-backend
   git branch -d swarm/frontend swarm/backend
\```

**Limitations:**
- Task tool has no `cwd` parameter (Feature Request #12748)
- Workaround: absolute paths in prompt + `cd path &&` prefix for Bash
- May need `additionalDirectories` in settings for worktree access
```

#### 9-EN: Expand cost optimization FREE tree

Replace L283-288 FREE tree with:
```plaintext
FREE (Claude Code Task tool):
├─ Simple search          → Grep, Glob, Read (direct tools)
├─ Codebase exploration   → Task(subagent_type="scout")
├─ External research      → Task(subagent_type="index")
├─ Frontend coding        → Task(subagent_type="frontend-developer")
├─ Backend coding         → Task(subagent_type="backend-architect")
├─ Database work          → Task(subagent_type="database-architect")
├─ Infrastructure         → Task(subagent_type="cloud-architect")
├─ Technical docs (free)  → Task(subagent_type="docs-architect")
├─ Architecture review    → Task(subagent_type="architect-review")
└─ General tasks          → Task(subagent_type="general-purpose")
```

#### 10-EN: Add cost optimization principles

Add after L301 (principle 4):
```
5. Delegate parallel coding to native coding agents — they are FREE and can write code
6. docs-architect and architect-review are free alternatives to quill and arch respectively
```

#### 11-EN: Add Implementation to request processing flowchart Step 1

Insert before L395 (`├─ Complex?`):
```
├─ Implementation? → Coding agents (frontend/backend/database/cloud) - FREE
```

#### 12-EN: Expand request processing flowchart Step 2 agent routing

Replace L399-401 Claude Code Task tool section with:
```
├─ Claude Code Task tool - FREE
│   ├─ scout             → Task(subagent_type="scout")
│   ├─ index             → Task(subagent_type="index")
│   ├─ frontend-developer → Task(subagent_type="frontend-developer")
│   ├─ backend-architect  → Task(subagent_type="backend-architect")
│   ├─ database-architect → Task(subagent_type="database-architect")
│   ├─ cloud-architect    → Task(subagent_type="cloud-architect")
│   ├─ docs-architect     → Task(subagent_type="docs-architect")
│   ├─ architect-review   → Task(subagent_type="architect-review")
│   └─ general-purpose    → Task(subagent_type="general-purpose")
```

---

### SKILL.ko.md (Korean)

#### 1-KO: Frontmatter version bump

L4: `version: 2.0.0` → `version: 2.1.0`

#### 2-KO: Add Implementation to Phase 0 request classification

Insert before L27 (`├─ Research`):
```
├─ Implementation  → 코딩 에이전트에 위임 (다중 파일 시 패턴 E)
```

#### 3-KO: Add coding agents to tool selection priority table

Insert below L72, above L73:
```markdown
| `cco-frontend-developer` | FREE | 프론트엔드 구현 (React, CSS, 레이아웃) (Task tool) |
| `cco-backend-architect` | FREE | 백엔드 구현 (API, 서비스) (Task tool) |
| `cco-database-architect` | FREE | DB 스키마, 마이그레이션 (Task tool) |
| `cco-cloud-architect` | FREE | 인프라, 배포 설정 (Task tool) |
| `cco-docs-architect` | FREE | 코드 기반 기술 문서 (quill 무료 대안) (Task tool) |
| `cco-architect-review` | FREE | 아키텍처 리뷰 (arch 무료 대안) (Task tool) |
| `general-purpose` | FREE | 범용 코딩, 전체 도구 접근 (Task tool) |
```

#### 4-KO: Add CODING AGENTS section to agent routing rules box

Insert below L88, above L90 (Korean version of 4-EN):
```
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
```

#### 5-KO: Add coding agent sub-table to agent role table

Insert below L166, above L168:
```markdown
**Claude Code 코딩 에이전트 (Task tool) - FREE:**

| 에이전트 | 호출 방법 | 용도 | 트리거 |
|----------|-----------|------|--------|
| `cco-frontend-developer` | `Task(subagent_type="frontend-developer")` | React, Next.js, CSS, 반응형 레이아웃 | "UI 만들어", "컴포넌트 생성", "스타일", "페이지" |
| `cco-backend-architect` | `Task(subagent_type="backend-architect")` | API 설계, 마이크로서비스, 서버 로직 | "API 만들어", "엔드포인트", "서비스", "미들웨어" |
| `cco-database-architect` | `Task(subagent_type="database-architect")` | 스키마 모델링, 마이그레이션, 쿼리 | "스키마", "마이그레이션", "데이터베이스", "모델" |
| `cco-cloud-architect` | `Task(subagent_type="cloud-architect")` | AWS/Azure/GCP, IaC, 배포 | "배포", "인프라", "CI/CD", "Docker" |
| `cco-docs-architect` | `Task(subagent_type="docs-architect")` | 코드 기반 기술 문서 (quill 무료 대안) | "문서 작성", "가이드", "기술 문서" |
| `cco-architect-review` | `Task(subagent_type="architect-review")` | 아키텍처 리뷰 (arch 무료 대안) | "아키텍처 리뷰", "설계 검토" |
| `general-purpose` | `Task(subagent_type="general-purpose")` | 범용 코딩, 전체 도구 접근 | 구현 작업 범용 |
```

#### 6-KO: Add coding domains to delegation table

Insert below L186 (Image/PDF row):
```markdown
| 프론트엔드 코딩 | `cco-frontend-developer` (native) | 빌드, 컴포넌트, React, 페이지, 레이아웃 |
| 백엔드 코딩 | `cco-backend-architect` (native) | API, 엔드포인트, 서비스, 서버, 미들웨어 |
| DB 작업 | `cco-database-architect` (native) | 스키마, 마이그레이션, 모델, 쿼리 |
| 인프라 | `cco-cloud-architect` (native) | 배포, Docker, CI/CD, 인프라, 클라우드 |
| 기술 문서 (무료) | `cco-docs-architect` (native) | 문서, 가이드 (quill 대비 비용 절감) |
| 아키텍처 리뷰 (무료) | `cco-architect-review` (native) | 리뷰, 검토 (arch 대비 비용 절감) |
| 범용 코딩 | `general-purpose` (native) | 구현, 코드, 빌드 (범용) |
```

#### 7-KO: Add Pattern E (basic parallel implementation)

Insert after Pattern D (L261-268), before `---` (L270):
```markdown
### 패턴 E: 병렬 구현

\```
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
\```

**컨텍스트 전달 (CRITICAL):**
\```
위임 프롬프트 구조를 사용하여 설계 출력을 각 워커에 포함:

## CONTEXT
[설계 계획 출력을 여기에 붙여넣기]

## YOUR SCOPE
[이 에이전트가 다룰 파일/디렉토리 - 절대 경로 사용]

## MUST_NOT_DO
- 담당 범위 밖의 파일 수정 금지
- 다른 에이전트에 할당된 작업 중복 금지
\```

**파일 범위 지정 (충돌 방지):**
\```
├─ frontend-developer → src/components/, src/pages/, src/styles/
├─ backend-architect  → src/api/, src/services/, src/middleware/
├─ database-architect → src/models/, src/migrations/, prisma/
├─ cloud-architect    → infra/, docker/, .github/workflows/
├─ docs-architect     → docs/
└─ architect-review   → 분석만 수행 (파일 수정 없음)
\```
```

#### 8-KO: Add Pattern E-iso (git worktree isolation)

Insert right after Pattern E:
```markdown
### 패턴 E-iso: Git Worktree 격리 병렬 구현

여러 에이전트가 같은 파일을 수정해야 하거나 안전한 롤백이 필요할 때:

\```
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
\```

**제약사항:**
- Task tool에 `cwd` 파라미터 없음 (Feature Request #12748)
- 워크어라운드: 프롬프트에 절대 경로 + Bash에 `cd path &&` 접두사
- 설정에 `additionalDirectories` 추가 필요할 수 있음
```

#### 9-KO: Expand cost optimization tree

Replace L274-279 cost tree with:
```plaintext
FREE (Claude Code Task tool):
├─ 단순 검색             → Grep, Glob (항상 무료 우선)
├─ 코드베이스 탐색       → Task(subagent_type="scout")
├─ 외부 리서치           → Task(subagent_type="index")
├─ 프론트엔드 코딩       → Task(subagent_type="frontend-developer")
├─ 백엔드 코딩           → Task(subagent_type="backend-architect")
├─ DB 작업               → Task(subagent_type="database-architect")
├─ 인프라                → Task(subagent_type="cloud-architect")
├─ 기술 문서 (무료)      → Task(subagent_type="docs-architect")
├─ 아키텍처 리뷰 (무료)  → Task(subagent_type="architect-review")
└─ 범용 작업             → Task(subagent_type="general-purpose")

PAID (MCP external APIs):
├─ 아키텍처 결정         → arch (GPT-5.2, expensive)
├─ UI/UX 작업           → canvas (Gemini, moderate)
├─ 문서화               → quill (Gemini, moderate)
└─ 이미지/PDF 분석      → lens (Gemini, moderate)
```

#### 10-KO: Add cost optimization principles

Add after L285 (principle 3):
```
4. 병렬 코딩은 네이티브 코딩 에이전트에 위임 — 무료이며 코드 작성 가능
5. docs-architect는 quill의, architect-review는 arch의 무료 대안
```

#### 11-KO: Add Implementation to request processing flowchart Step 1

Insert before L376 (`├─ Complex?`):
```
├─ Implementation? → 코딩 에이전트 (frontend/backend/database/cloud) - FREE
```

#### 12-KO: Expand request processing flowchart Step 2

Replace L379-383 Step 2 with:
```
[Step 2: 에이전트 라우팅]
├─ Claude Code Task tool - FREE
│   ├─ scout             → Task(subagent_type="scout")
│   ├─ index             → Task(subagent_type="index")
│   ├─ frontend-developer → Task(subagent_type="frontend-developer")
│   ├─ backend-architect  → Task(subagent_type="backend-architect")
│   ├─ database-architect → Task(subagent_type="database-architect")
│   ├─ cloud-architect    → Task(subagent_type="cloud-architect")
│   ├─ docs-architect     → Task(subagent_type="docs-architect")
│   ├─ architect-review   → Task(subagent_type="architect-review")
│   └─ general-purpose    → Task(subagent_type="general-purpose")
└─ MCP agents (background_task) - PAID
    ├─ arch   → GPT-5.2
    ├─ canvas → Gemini 3
    ├─ quill  → Gemini 3
    └─ lens   → Gemini 3

[Step 3: 실행]
├─ 병렬 가능한 작업 식별
├─ Native 에이전트 + MCP 에이전트 병렬 실행
├─ 직접 처리 가능한 건 바로 처리
└─ 결과 수집 및 통합
```

---

### SKILL.ko.md Bug Fixes

#### BUG-1: Pattern A incorrect agent invocation

L239: `background_task(index, "레퍼런스 검색...")` → `Task(subagent_type="index", prompt="레퍼런스 검색...")`

#### BUG-2: Pattern C incorrect agent invocation

L256: `background_task(index, "업계 사례...")` → `Task(subagent_type="index", prompt="업계 사례...")`

---

### Verification

- [ ] **V-1** Run `npm run setup` to deploy to `~/.claude/skills/orchestrate/`
- [ ] **V-2** Verify SKILL.md markdown structure (tables, code blocks, box diagrams intact)
- [ ] **V-3** Verify SKILL.ko.md markdown structure

## What NOT to Change

- Phase 1 (Codebase Evaluation), Phase 3 (Completion Verification) structure
- MCP agent definitions (arch/canvas/quill/lens)
- Existing patterns A~E (English) / A~D (Korean) content
- Delegation prompt 7-section structure
- MCP server code
- Agent definition files (agents/*.md)
