---
name: ui-qa
description: 브라우저 자동화와 멀티모달 분석을 통한 UI 품질 검증
version: 1.0.0
author: CC Orchestrator
tags: [ui, qa, visual-testing, accessibility, browser, claude-in-chrome]
---

# UI QA 스킬

브라우저 자동화와 AI 기반 스크린샷 분석을 사용하여 프론트엔드 애플리케이션의 시각적 품질을 검증합니다.

## 사용법

```text
/ui-qa [url]
```

## 인자

- `url` (선택): 테스트할 URL. 생략 시 일반적인 포트(3000, 5173, 8080 등)에서 dev server를 자동 감지합니다.

## 예시

```text
/ui-qa
/ui-qa http://localhost:3000
/ui-qa http://localhost:5173/dashboard
/ui-qa http://localhost:8080/components/button
```

---

## 실행 지침

사용자가 `/ui-qa`를 실행하면 다음 단계를 수행하세요:

### 1단계: URL 인자 파싱

- `/ui-qa` 뒤에 URL이 제공되면 해당 URL 사용
- URL이 없으면 일반적인 포트를 스캔하여 dev server 감지

### 2단계: Dev Server 감지 (URL 없는 경우)

다음 포트를 순서대로 스캔하여 첫 번째 응답하는 포트 사용:
- 3000 (React/Next.js 기본)
- 3001 (React 대체)
- 5173, 5174 (Vite 기본)
- 8080, 8081 (Vue CLI / 일반)
- 4200 (Angular)
- 4321 (Astro)

서버를 찾지 못하면 사용자에게 안내:
> "dev server를 찾지 못했습니다. dev server를 시작하거나 URL을 제공해주세요: `/ui-qa http://localhost:PORT`"

### 3단계: 브라우저 탭 획득

```text
mcp__claude-in-chrome__tabs_context_mcp 호출:
  createIfEmpty: true
```

반환된 `tabId`를 이후 작업에 사용합니다.

### 4단계: URL로 이동

```text
mcp__claude-in-chrome__navigate 호출:
  url: <감지된 또는 제공된 URL>
  tabId: <3단계에서 획득>
```

### 5단계: 페이지 로드 대기

```text
mcp__claude-in-chrome__computer 호출:
  action: "wait"
  duration: 3
  tabId: <3단계에서 획득>
```

### 6단계: 스크린샷 촬영

```text
mcp__claude-in-chrome__computer 호출:
  action: "screenshot"
  tabId: <3단계에서 획득>
```

반환된 `imageId`를 저장합니다.

### 7단계: 멀티모달 에이전트로 UI 분석

```text
mcp__ccmo__background_task 호출:
  agent: "multimodal-analyzer"
  description: "UI QA 분석"
  prompt: |
    시니어 UX 엔지니어로서 이 UI 스크린샷을 분석해주세요:

    1. 시각적 일관성: 색상 조화, 타이포그래피, 간격, 계층 구조
    2. 레이아웃 이슈: 오버플로우, 정렬, 간격, z-index 문제
    3. 접근성: 색상 대비(WCAG AA), 터치 타겟, 포커스 상태
    4. 반응형 디자인: 콘텐츠 맞춤, 텍스트 래핑, 이미지 스케일링

    평가 결과: PASS | MINOR_ISSUES | NEEDS_ATTENTION | CRITICAL
    위치와 권장 사항과 함께 구체적인 발견 사항을 나열해주세요.
```

### 8단계: 분석 결과 대기

```text
mcp__ccmo__background_output 호출:
  task_id: <7단계에서 획득>
  block: true
  timeout_ms: 60000
```

### 9단계: 결과 보고

다음 형식으로 사용자에게 결과 제시:

```markdown
## UI QA 결과 - [URL]

### 종합 평가
[PASS / MINOR_ISSUES / NEEDS_ATTENTION / CRITICAL]

### 시각적 일관성
- [발견 사항 또는 "이슈 없음"]

### 레이아웃 이슈
- [발견 사항 또는 "이슈 없음"]

### 접근성
- [발견 사항 또는 "이슈 없음"]

### 권장 사항
1. [우선순위 높은 권장 사항]
2. [보조 권장 사항]
```

---

## 오류 처리

| 상황 | 응답 |
|------|------|
| dev server 없음 | "dev server를 찾지 못했습니다. dev server를 시작하거나 URL을 제공해주세요." |
| 네비게이션 실패 | "페이지 로드 실패. URL이 올바르고 서버가 실행 중인지 확인하세요." |
| 스크린샷 실패 | "스크린샷을 캡처할 수 없습니다. 페이지가 아직 로딩 중일 수 있습니다." |
| 분석 타임아웃 | "UI 분석이 타임아웃되었습니다. 나중에 다시 시도하세요." |
| 브라우저 탭 없음 | "브라우저 탭을 가져올 수 없습니다. Claude in Chrome 확장 프로그램이 활성화되어 있는지 확인하세요." |

---

## 설정

UI QA 기능은 `~/.claude/hooks/ui_qa_config.json`에서 설정할 수 있습니다:

```json
{
  "enabled": true,
  "dev_server": {
    "explicit_url": "http://localhost:3000",
    "port_scan_range": [3000, 5173, 8080]
  },
  "qa_settings": {
    "screenshot_delay_ms": 2000
  }
}
```

---

## 요구 사항

- **Claude in Chrome 확장 프로그램**이 설치되고 활성화되어 있어야 합니다
- **CC Orchestrator MCP 서버**가 실행 중이어야 합니다 (multimodal-analyzer용)
- **Dev server**가 지원되는 포트에서 실행 중이어야 합니다

---

## 팁

1. **특정 페이지 테스트**: 전체 URL을 제공하여 특정 라우트 테스트
   ```text
   /ui-qa http://localhost:3000/login
   ```

2. **변경 후 검증**: 시각적 변경 후 UI QA를 실행하여 확인
   ```text
   /ui-qa
   ```

3. **모바일 테스트**: 반응형 테스트를 위해 실행 전 브라우저 크기 조절
