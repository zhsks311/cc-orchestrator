---
name: ui-qa
description: Visual UI quality assurance using browser automation and multimodal analysis
version: 1.0.0
author: CC Orchestrator
tags: [ui, qa, visual-testing, accessibility, browser, claude-in-chrome]
---

# UI QA Skill

Perform visual quality assurance on your frontend application using browser automation and AI-powered screenshot analysis.

## Usage

```
/ui-qa [url]
```

## Arguments

- `url` (optional): The URL to test. If omitted, auto-detects dev server on common ports (3000, 5173, 8080, etc.)

## Examples

```
/ui-qa
/ui-qa http://localhost:3000
/ui-qa http://localhost:5173/dashboard
/ui-qa http://localhost:8080/components/button
```

---

## Execution Instructions

When the user runs `/ui-qa`, execute the following steps:

### Step 1: Parse URL Argument

- If URL is provided after `/ui-qa`, use that URL
- If no URL provided, detect dev server by scanning common ports

### Step 2: Detect Dev Server (if no URL)

Scan these ports in order and use the first responding one:
- 3000 (React/Next.js default)
- 3001 (React alternate)
- 5173, 5174 (Vite default)
- 8080, 8081 (Vue CLI / generic)
- 4200 (Angular)
- 4321 (Astro)

If no server found, inform the user:
> "No dev server detected. Please start your dev server or provide a URL: `/ui-qa http://localhost:PORT`"

### Step 3: Get Browser Tab

```
Call mcp__claude-in-chrome__tabs_context_mcp with:
  createIfEmpty: true
```

Store the returned `tabId` for subsequent operations.

### Step 4: Navigate to URL

```
Call mcp__claude-in-chrome__navigate with:
  url: <detected or provided URL>
  tabId: <from step 3>
```

### Step 5: Wait for Page Load

```
Call mcp__claude-in-chrome__computer with:
  action: "wait"
  duration: 3
  tabId: <from step 3>
```

### Step 6: Take Screenshot

```
Call mcp__claude-in-chrome__computer with:
  action: "screenshot"
  tabId: <from step 3>
```

Store the returned `imageId`.

### Step 7: Analyze UI with Multimodal Agent

```
Call mcp__ccmo__background_task with:
  agent: "multimodal-analyzer"
  description: "UI QA analysis"
  prompt: |
    Analyze this UI screenshot as a senior UX engineer. Evaluate:

    1. Visual Consistency: color harmony, typography, spacing, hierarchy
    2. Layout Issues: overflow, alignment, gaps, z-index problems
    3. Accessibility: color contrast (WCAG AA), touch targets, focus states
    4. Responsive Design: content fitting, text wrapping, image scaling

    Provide assessment: PASS | MINOR_ISSUES | NEEDS_ATTENTION | CRITICAL
    List specific findings with locations and recommendations.
```

### Step 8: Wait for Analysis

```
Call mcp__ccmo__background_output with:
  task_id: <from step 7>
  block: true
  timeout_ms: 60000
```

### Step 9: Report Results

Present findings to user in this format:

```markdown
## UI QA Results for [URL]

### Overall Assessment
[PASS / MINOR_ISSUES / NEEDS_ATTENTION / CRITICAL]

### Visual Consistency
- [findings or "No issues found"]

### Layout Issues
- [findings or "No issues found"]

### Accessibility
- [findings or "No issues found"]

### Recommendations
1. [Priority recommendation]
2. [Secondary recommendation]
```

---

## Error Handling

| Scenario | Response |
|----------|----------|
| No dev server | "No dev server detected. Start your dev server or provide URL." |
| Navigation fails | "Failed to load page. Check if URL is correct and server is running." |
| Screenshot fails | "Unable to capture screenshot. Page may still be loading." |
| Analysis timeout | "UI analysis timed out. Try again later." |
| No browser tab | "Could not get browser tab. Ensure Claude in Chrome extension is active." |

---

## Configuration

The UI QA feature can be configured in `~/.claude/hooks/ui_qa_config.json`:

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

## Requirements

- **Claude in Chrome extension** must be installed and active
- **CC Orchestrator MCP server** must be running (for multimodal-analyzer)
- **Dev server** must be running on a supported port

---

## Tips

1. **Specific pages**: Test specific routes by providing full URL
   ```
   /ui-qa http://localhost:3000/login
   ```

2. **After changes**: Run UI QA after making visual changes to verify
   ```
   /ui-qa
   ```

3. **Mobile testing**: For responsive testing, resize browser before running
