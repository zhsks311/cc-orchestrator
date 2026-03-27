# CC Orchestrator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/cc-orchestrator.svg)](https://www.npmjs.com/package/cc-orchestrator)

**[한국어 문서 (Korean)](./README.ko.md)**

> _"Why use one AI when you can summon an entire orchestra and make them fight over your code?"_

**CC Orchestrator** is a runtime-first orchestration engine for coding agent CLIs. A main coding agent installs it, discovers available sub-agent CLIs, and uses MCP tools to start sessions, relay context, run structured debate, and aggregate the result into a next action.

---

## 🎭 The Pitch

Picture this: you have a main coding agent that is good at steering a task, but you want it to consult and challenge other coding agents before it commits to a design or implementation path.

**CC Orchestrator** says: _"What if the main agent could spin up other agent CLIs, let them debate a plan, and keep a session graph of who said what?"_

<p align="center">
  <img src="./assets/orchestrator-diagram.jpg" alt="CC Orchestrator Diagram" width="600">
</p>

Inspired by [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode). The current rewrite keeps MCP as the first host integration, but the orchestration core itself is being rebuilt to stay independent from any single host.

---

## ✨ Features (The Good Stuff)

### 🎯 Main-Agent / Sub-Agent Sessions

The core unit is no longer "send a prompt to a model provider." It is "start a session on a coding agent CLI and keep talking to it."

- A main agent starts sub-agent sessions
- Each session keeps its own transcript, artifacts, and status
- Sessions can be revisited with follow-up messages
- The orchestrator tracks session history instead of one-shot task output

### 🧠 Capability-First Routing

The new runtime selects workers by capability instead of hard-coded personas.

- `planning`
- `implementation`
- `codebase_search`
- `patch_edit`
- `shell_execution`
- `multi_turn_chat`
- `debate_participation`
- `stance_simulation`

### 🗣️ Structured Debate

The interesting part is not just parallel execution. It is verification.

- One session drafts an idea or plan
- Other sessions challenge it through structured debate threads
- Each session can internally simulate multiple stances
- The orchestrator returns consensus, dissent, and supporting evidence

```text
Writer session      → Draft plan
Reviewer sessions   → Challenge / refine / reject
Internal stances    → Skeptic / implementer / reviewer
Final output        → Consensus + disagreements + evidence
```

### 🔌 MCP As The First Host Adapter

MCP is still the first public interface because it is a practical way for a main coding agent to call the orchestrator. But MCP is no longer the product boundary.

- The orchestration core lives in `src/core/`
- MCP lives in `src/server/`
- Future host adapters can be added without rewriting the core

---

## 🚀 Installation

### Current Rewrite Status

The repository is in the middle of a runtime-first rewrite. The public direction is stable, but some sections below still describe the legacy provider-based implementation. Treat those sections as migration notes until the rewrite lands.

### Legacy Notes

The remaining parts of this README still describe the current implementation that is being replaced. They are kept temporarily so existing contributors can understand the code that is being migrated.

---

## 🎮 Usage

### Multi-Agent Orchestration

The main entry point. Let Claude Code coordinate multiple AI agents for complex tasks.

```bash
/orchestrate Implement user authentication with JWT
```

The orchestrator will:

1. Analyze your request and break it into steps
2. Select the best agent for each step (arch, canvas, index, etc.)
3. Run agents in parallel when possible
4. Collect and integrate results

### 🎯 Hierarchical Orchestration (Auto-Pilot Mode)

> _"Why plan tasks yourself when the orchestra can do it better?"_

**Hierarchical Orchestration** automatically breaks down complex requests into atomic tasks, assigns the best agent for each, and executes them in parallel when it can.

**How It Works:**

1. **Decompose**: LLM splits your request into discrete work units
2. **Select**: Rules assign the best agent for each task
3. **Build DAG**: Dependencies become a graph, not a mess
4. **Execute**: Parallelize per level, wait when you must
5. **Aggregate**: Results stitched into a coherent response

**Usage:**

```typescript
import { HierarchicalOrchestrator } from './src/core/orchestration/HierarchicalOrchestrator.js';

const orchestrator = new HierarchicalOrchestrator(modelRouter, agentManager, contextStore);

const result = await orchestrator.orchestrate(
  'Implement JWT authentication with tests and documentation'
);

console.log(result.summary);
// "Implemented JWT auth with token service, middleware, tests, and docs."
```

**When to Use:**

- ✅ Complex multi-step projects
- ✅ Tasks that need multiple specialists
- ✅ When you want automatic parallelization
- ❌ Simple single-agent tasks (use direct agent calls)

**Configuration:**

```typescript
import type { OrchestrationConfig } from './src/types/hierarchical-orchestration.js';

const config: OrchestrationConfig = {
  maxParallelTasks: 5,
  taskTimeout: 300000,
  maxRetries: 2,
  failFast: false,
  minConfidence: 0.7,
};

await orchestrator.orchestrate(request, config);
```

**Benefits:**

- **Automatic Planning**: No manual task breakdown required
- **Smart Agent Selection**: Right specialist per task
- **Maximum Parallelism**: Faster than sequential execution
- **Fault Tolerance**: Partial failures handled gracefully
- **Visibility**: Detailed results and stats per task

### Single Agent Usage

For simpler tasks that only need one specialist.

**Native Agents (FREE)** - Runs on your Claude Code quota:

```bash
# Codebase exploration with Scout (Haiku)
"Use scout agent to find all authentication-related files"

# External research with Index (Sonnet + WebSearch)
"Use index agent to find Express middleware best practices"
```

**MCP Agents (External APIs)** - Requires API keys:

```bash
# Architecture review with Arch (GPT-5.2)
"Use arch agent to review this payment system architecture"

# UI/UX design with Canvas (Gemini)
"Use canvas agent to design a login page component"

# Documentation with Quill (Gemini)
"Use quill agent to write API docs for this module"

# Image analysis with Lens (Gemini)
"Use lens agent to analyze this wireframe screenshot"
```

### Other Skills

**UI Quality Assurance:**

```bash
/ui-qa                              # Auto-detect dev server
/ui-qa http://localhost:3000        # Test specific URL
```

Takes screenshots, analyzes with AI, reports visual issues, accessibility problems, and layout bugs.

**Context Checkpoint:**

```bash
/checkpoint "Auth system done, JWT approach chosen"
```

Saves your conversation context. Survives `/compact`. Because losing context hurts.

### Direct Tool Calls (For Control Freaks)

```javascript
// Launch an agent into the void
background_task({ agent: 'arch', prompt: 'Judge my life choices (the code ones)' });

// Check if they're still thinking
background_output({ task_id: 'abc123', block: false });

// Demand answers
background_output({ task_id: 'abc123', block: true });

// Cancel when you've had enough
background_cancel({ task_id: 'abc123' }); // Cancel one
background_cancel({ all: true }); // Cancel everything

// List all tasks
list_tasks({ filter: { status: ['running'] } });

// Share context between agents
share_context({ key: 'api_research', value: { findings: '...' } });
get_context({ key: 'api_research' });

// Get agent recommendation
suggest_agent({ query: 'I need to review this architecture' });
```

### AST-Powered Code Search (The Smart Way)

Forget grep. Search code by structure, not text.

```javascript
// Find all console.log calls
ast_search({ pattern: 'console.log($MSG)', path: './src' });

// Find all function declarations
ast_search({ pattern: 'function $NAME($$$ARGS) { $$$BODY }', path: './src' });

// Find all if statements
ast_search({ pattern: 'if ($COND) { $$$BODY }', path: './src' });

// Replace var with const (preview first)
ast_replace({
  pattern: 'var $NAME = $VAL',
  replacement: 'const $NAME = $VAL',
  path: './src',
  dry_run: true,
});
```

Supports TypeScript, JavaScript, Python, Rust, Go, Java, and more.

---

## 💡 Pro Tips

### 1. Native Agents Are Free. Abuse This.

The `scout` and `index` agents live in `.claude/agents/` and use your Claude Code quota. Zero extra API cost.

```bash
"Use scout agent to find all authentication files"
"Use index agent to find JWT best practices"
```

Perfect for:

- "Where the heck is that file?" → `scout`
- "How do I use this library?" → `index`
- "Show me the project structure" → `scout`

### 2. Arch Is Expensive. Use Wisely.

GPT-5.2 bills by the existential crisis. Save it for:

- Architecture decisions you'll regret later anyway
- Security reviews that make you lose sleep
- When you've tried fixing a bug 3 times and it's personal now

### 3. Parallelize Everything

Instead of this:

```text
"Research the API, then design the component, then review it"
```

Try this:

```text
"Use scout to find existing patterns"     // FREE (Haiku)
"Use index to find Stripe docs"         // FREE (WebSearch)
background_task(arch, "Review security...")  // GPT-5.2
```

Native + MCP agents. Running in parallel. Maximum efficiency.

---

## 🔧 Configuration

### Adapter Defaults

Customize the preferred runtime adapters in `~/.cco/config.json`:

```json
{
  "defaults": {
    "primaryAdapter": "codex",
    "fallbackAdapter": "claude-code"
  },
  "adapters": {
    "codex": {
      "runtime": "codex",
      "enabled": true,
      "command": "codex"
    },
    "claude_code": {
      "runtime": "claude-code",
      "enabled": true,
      "command": "claude"
    }
  }
}
```

### Environment Variables

```bash
# Override only the primary adapter
export CCO_PRIMARY_ADAPTER=claude-code

# Override only the fallback adapter
export CCO_FALLBACK_ADAPTER=codex

# Circuit Breaker Settings (NEW!)
# How many failures before we give up on a provider (default: 5)
export CCO_CIRCUIT_FAILURE_THRESHOLD=5

# How long to wait before trying again (milliseconds, default: 60000)
export CCO_CIRCUIT_RESET_TIMEOUT=60000
```

---

## 📦 Project Structure

```text
cc-orchestrator/
├── .claude/                # Claude Code native config
│   └── agents/             # Native agents (FREE, no API calls)
│       ├── scout.md     # Codebase exploration (Haiku)
│       └── index.md   # External research (WebSearch)
├── src/                    # The TypeScript jungle
│   ├── core/               # Business logic (MCP-free zone)
│   │   ├── agents/         # MCP agent definitions
│   │   ├── models/         # Model routing & provider wrangling
│   │   ├── ast/            # AST search/replace engine
│   │   ├── context/        # Context sharing between agents
│   │   └── orchestration/  # The conductor's baton
│   ├── server/             # MCP protocol stuff
│   └── types/              # Types. So many types.
├── hooks/                  # Python automation (spicy)
│   ├── context_resilience/ # Context recovery system
│   ├── adapters/           # Multi-model adapters (Gemini, Copilot, etc.)
│   └── prompts/            # Prompt templates
├── skills/                 # Claude Code skills (extra spicy)
└── scripts/                # Setup scripts (mild)
```

---

## 🪝 Hooks System

Automation that runs behind the scenes. Like a helpful ghost.

| Hook                  | What it does                                                   |
| --------------------- | -------------------------------------------------------------- |
| `context_resilience`  | Auto-recovers context after `/compact`. Your memory, preserved |
| `todo_enforcer`       | Reminds you (aggressively) to use the todo list                |
| `review_orchestrator` | Coordinates multi-model code reviews                           |
| `quota_monitor`       | Tracks API usage before your wallet cries                      |

Hooks live in `~/.claude/hooks/` after installation.

---

## 🧰 Full Tool Reference

| Tool                | Description                          |
| ------------------- | ------------------------------------ |
| `background_task`   | Launch agent in background           |
| `background_output` | Get task status/results              |
| `background_cancel` | Cancel running tasks                 |
| `list_tasks`        | List all tasks in session            |
| `share_context`     | Share data between agents            |
| `get_context`       | Retrieve shared data                 |
| `suggest_agent`     | Get agent recommendation for a query |
| `ast_search`        | Search code by AST pattern           |
| `ast_replace`       | Replace code by AST pattern          |

---

## 🗑️ Uninstallation

Changed your mind? No hard feelings.

```bash
npm run uninstall
```

Options:

1. **Everything** — Nuclear option. Gone.
2. **Local only** — Keep Claude config, delete project files
3. **Claude config only** — Keep project, remove from Claude

---

## 🐛 Troubleshooting

| Problem           | Cause                      | Solution                                         |
| ----------------- | -------------------------- | ------------------------------------------------ |
| MCP won't connect | Someone used `console.log` | Find it. Delete it. Never speak of this.         |
| Agent stuck       | API being dramatic         | Check your keys. Check their status page. Curse. |
| Session stalls    | Adapter CLI is blocked     | Inspect stderr logs, then restart the session    |
| No response       | You broke it               | `LOG_LEVEL=debug npm run dev`, then panic        |

---

## 🙏 Credits

- [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode) — We borrowed generously from their genius
- [Model Context Protocol](https://modelcontextprotocol.io/) — Making this chaos possible
- [Claude Code](https://claude.ai/claude-code) — The stage for our little orchestra

---

## 📄 License

MIT — Do whatever you want. We're not your parents.

---

<p align="center">
  <i>Stop asking one AI to be everything.<br>Start conducting an orchestra.<br><br>🎼 May your builds be fast and your agents cooperative. 🎼</i>
</p>
