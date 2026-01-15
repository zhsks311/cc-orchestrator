# CC Orchestrator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/cc-orchestrator.svg)](https://www.npmjs.com/package/cc-orchestrator)

**[한국어 문서 (Korean)](./README.ko.md)**

> *"Why settle for one AI when you can have an entire orchestra?"*

**CC Orchestrator** turns Claude Code into a conductor, directing multiple AI models to work together in harmony. Think of it as your personal AI symphony — GPT-5.2 handles the architecture, Gemini crafts the UI, and Claude researches the docs. All at once. In parallel.

---

## 🎭 The Concept

Imagine you're building a complex feature. You need:
- **Strategic thinking** for architecture decisions
- **Creative flair** for UI/UX design
- **Deep research** into documentation and best practices

Traditionally, you'd ask one AI to do everything. But what if each task went to the *specialist* best suited for it?

**That's CC Orchestrator.**

```
┌─────────────────────────────────────────────────────────────┐
│                     🎼 CC Orchestrator                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   You: "Build me a payment system"                          │
│                                                             │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐               │
│   │   Arch   │   │  Canvas  │   │  Index   │               │
│   │ (GPT-5.2)│   │ (Gemini) │   │ (Claude) │               │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘               │
│        │              │              │                      │
│        ▼              ▼              ▼                      │
│   "Here's the    "Here's a      "Here are                  │
│    architecture"  beautiful UI"   Stripe docs"              │
│                                                             │
│   ══════════════════════════════════════════                │
│              All running in parallel! ⚡                     │
└─────────────────────────────────────────────────────────────┘
```

Inspired by [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode), this project brings multi-model orchestration to the Claude Code ecosystem.

---

## ✨ Key Features

### 🎯 Specialized Agents

Each agent is optimized for what they do best:

| Agent | Model | Superpower |
|-------|-------|------------|
| **Arch** | GPT-5.2 | 🧠 The architect. Strategic decisions, code review, system design |
| **Canvas** | Gemini 3 Pro | 🎨 The artist. Beautiful UIs, pixel-perfect components |
| **Index** | Claude Sonnet 4.5 | 📚 The scholar. Documentation hunter, codebase analyst |
| **Quill** | Gemini 3 Pro | ✍️ The writer. README, API docs, technical writing |
| **Lens** | Gemini 2.5 Flash | 👁️ The observer. Images, PDFs, screenshots |
| **Scout** | Claude Sonnet | 🔍 The scout. Quick codebase exploration (FREE!) |

### ⚡ Parallel Execution

Why wait when you can run everything at once?

```
Traditional:  Task A → Task B → Task C  (Sequential, slow 🐌)
              ════════════════════════

CC Orchestrator:  Task A ─┐
                  Task B ─┼→ All done! (Parallel, fast 🚀)
                  Task C ─┘
```

### 🔄 Smart Fallbacks

API key missing? Provider down? No problem.

```
Arch needs GPT-5.2, but OpenAI is unavailable?
  → Falls back to Anthropic
  → Still unavailable? Falls back to Google
  → Your work continues uninterrupted ✓
```

### 🎹 Keyword Triggers

Just type naturally and let the magic happen:

| Say this... | ...and get this |
|-------------|-----------------|
| `ultrawork` or `ulw` | 🔥 Maximum parallel mode — all agents fire at once |
| `search` or `찾아` | 📖 Index deep-dives into documentation |
| `analyze` or `분석` | 🔬 Arch + Index work sequentially for deep analysis |

### 🧠 Context Resilience

Ever used `/compact` and watched Claude forget everything? We fixed that.

The Context Resilience Framework automatically:
- **Saves** your decisions, resolved errors, and active files
- **Detects** important moments ("decided to use JWT", "fixed the bug")
- **Recovers** everything when you start a new session

No more repeating yourself. No more lost context.

---

## 🚀 Installation

### For Humans: The One-Liner

```bash
npx cc-orch
```

That's it. The interactive installer handles everything:
- ✅ API key configuration
- ✅ Claude Code integration
- ✅ Python hooks installation
- ✅ Skills registration

Just answer a few questions and you're ready to orchestrate.

---

### For Claude Code: Manual Installation

When Claude Code is setting this up autonomously, use the manual approach:

```bash
# 1. Clone the repository
git clone https://github.com/zhsks311/cc-orchestrator.git
cd cc-orchestrator

# 2. Install dependencies
npm install

# 3. Create environment file
cat > .env << 'EOF'
# Add your API keys (at least one required)
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Timeout settings
CCO_TIMEOUT_SECONDS=300
EOF

# 4. Build the project
npm run build

# 5. Register with Claude Desktop
# Add to ~/.claude/claude_desktop_config.json:
```

```json
{
  "mcpServers": {
    "cc-orchestrator": {
      "command": "node",
      "args": ["/absolute/path/to/cc-orchestrator/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "GOOGLE_API_KEY": "AIza...",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

```bash
# 6. (Optional) Install Python hooks for advanced features
cp -r hooks/* ~/.claude/hooks/

# 7. (Optional) Install skills
cp -r skills/* ~/.claude/skills/

# 8. Restart Claude Code
```

---

## 🎮 Usage

### Talk to Your Agents

Just ask naturally:

```
"Hey Arch, review this architecture for security issues"

"Canvas, create a dark mode toggle component"

"Index, find me examples of rate limiting in Express"
```

### Use the Orchestrate Skill

For complex multi-step tasks:

```
/orchestrate Implement user authentication with JWT
```

The orchestrator will:
1. Break down the task into steps
2. Assign each step to the best agent
3. Track progress and report back

### Direct Tool Calls

For precise control:

```javascript
// Spawn an agent in the background
background_task({ agent: "arch", prompt: "Review this code..." })

// Check on progress
background_output({ task_id: "abc123", block: false })

// Get the final result
background_output({ task_id: "abc123", block: true })
```

---

## 💡 Pro Tips

### 1. Start with Scout (It's Free!)

The `scout` agent uses your existing Claude quota — no extra API costs. Perfect for:
- Quick codebase navigation
- Finding files and functions
- Understanding project structure

### 2. Use Arch Wisely

GPT-5.2 is powerful but pricey. Save it for:
- Critical architecture decisions
- Complex code reviews
- Strategic planning

### 3. Parallelize Everything

Instead of:
```
"First research the API, then design the component, then review"
```

Try:
```
"ultrawork: Research Stripe API, design payment form, review security"
```

All three agents work simultaneously!

---

## 🔧 Configuration

### Provider Priority

Customize which providers to prefer in `~/.cco/config.json`:

```json
{
  "providers": {
    "priority": ["anthropic", "google", "openai"]
  },
  "roles": {
    "arch": {
      "providers": ["openai", "anthropic"]
    }
  }
}
```

### Environment Variables

```bash
# Global provider priority
export CCO_PROVIDER_PRIORITY=anthropic,google,openai

# Role-specific priority
export CCO_ARCH_PROVIDERS=openai,anthropic

# Timeout (seconds)
export CCO_TIMEOUT_SECONDS=300
```

---

## 📦 Project Structure

```
cc-orchestrator/
├── src/                    # TypeScript source
│   ├── core/               # Business logic (MCP-agnostic)
│   │   ├── agents/         # Agent management
│   │   ├── models/         # Model routing & providers
│   │   └── orchestration/  # DAG-based orchestration
│   ├── server/             # MCP protocol handling
│   └── types/              # Type definitions & errors
├── hooks/                  # Python automation hooks
├── skills/                 # Claude Code skills
└── scripts/                # Setup & maintenance scripts
```

---

## 🗑️ Uninstallation

```bash
npm run uninstall
```

Choose what to remove:
1. **Everything** — Local files + Claude configuration
2. **Local only** — .env, dist, node_modules
3. **Claude config only** — Hooks, skills, desktop config

---

## 🙏 Credits

- [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode) — The original inspiration
- [Model Context Protocol](https://modelcontextprotocol.io/) — The foundation
- [Claude Code](https://claude.ai/claude-code) — The platform

---

## 📄 License

MIT — Use it, modify it, share it. Go wild.

---

<p align="center">
  <i>Stop asking one AI to do everything.<br>Start conducting an orchestra.</i>
</p>
