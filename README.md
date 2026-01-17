# CC Orchestrator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/cc-orchestrator.svg)](https://www.npmjs.com/package/cc-orchestrator)

**[한국어 문서 (Korean)](./README.ko.md)**

> *"Why use one AI when you can summon an entire orchestra and make them fight over your code?"*

**CC Orchestrator** transforms Claude Code into a maestro conducting a symphony of AI models. GPT-5.2 argues about architecture, Gemini obsesses over pixels, and Claude dives into documentation rabbit holes. All at the same time. Because waiting is for people who enjoy watching loading spinners.

---

## 🎭 The Pitch

Picture this: You need to build something complex. Traditionally, you'd ask one AI to be an architect, designer, researcher, and writer all at once. That's like asking your dentist to also fix your car.

**CC Orchestrator** says: *"What if we just... hired specialists?"*

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
│   "Here's why     "Here's a      "Here's every            │
│    microservices   gorgeous UI"   Stripe doc ever          │
│    are a trap"                    written"                 │
│                                                             │
│   ══════════════════════════════════════════                │
│              All running in parallel! ⚡                     │
└─────────────────────────────────────────────────────────────┘
```

Inspired by [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode). We stole the idea and made it work with Claude Code. Innovation!

---

## ✨ Features (The Good Stuff)

### 🎯 Specialized Agents

Each agent has exactly one job. They're very good at it. They will not shut up about it.

| Agent | Model | Personality |
|-------|-------|-------------|
| **Arch** | GPT-5.2 | 🧠 The overthinker. Will write 3 pages about why your variable name is "technically correct but philosophically questionable" |
| **Canvas** | Gemini 3 Pro | 🎨 The artist. Believes every button deserves a 47ms cubic-bezier transition |
| **Index** | Claude Sonnet 4.5 | 📚 The librarian. Has read every documentation page. Will cite sources. Cannot be stopped |
| **Quill** | Gemini 3 Pro | ✍️ The poet. Writes README files so beautiful they make developers cry |
| **Lens** | Gemini 3 Flash | 👁️ The detective. Stares at your screenshots and PDFs until they confess their secrets |
| **Scout** | Claude Sonnet | 🔍 The intern. Fast, free, and surprisingly competent at finding things. We don't pay them |

### ⚡ Parallel Execution

Why do things one at a time like some kind of single-threaded peasant?

```
The old way:    Task A → Task B → Task C    (3 hours of your life, gone)

The new way:    Task A ─┐
                Task B ─┼→ Done!            (They raced. Everyone won)
                Task C ─┘
```

### 🔄 Fallback System (The Safety Net)

APIs go down. It happens. We're prepared.

```
You: "Arch, review this code"
Arch: *tries to call GPT-5.2*
OpenAI: "lol no" (503)
CC Orchestrator: "Fine, Claude can do it"
Claude: "I was literally made for this"
```

Automatic cross-provider fallbacks. Your work continues. Your deadline survives.

### 🎹 Trigger Keywords

Talk to your agents naturally. They're listening. (Not in a creepy way.)

**Summon the whole squad:**
| Say this... | What happens |
|-------------|--------------|
| `@all` | Everyone gets to work. Chaos ensues (productively) |
| `@team` | Same energy, different vibe |
| `parallel` | You want speed. We respect that |
| `simultaneously` | For when you feel fancy |
| `together` | Teamwork makes the dream work |

**Call a specific agent:**
| Mention | Who answers |
|---------|-------------|
| `@arch` or `@architect` | The overthinker arrives |
| `@canvas`, `@ui`, `@frontend` | The pixel perfectionist |
| `@index` or `@researcher` | The documentation hoarder |
| `@quill`, `@docs`, `@writer` | The prose professional |
| `@lens`, `@image`, `@pdf` | The visual investigator |
| `@scout`, `@find`, `@search` | The speedy explorer |

---

## 🚀 Installation

### The Easy Way (For Humans)

```bash
npx cc-orchestrator@latest
```

That's it. The installer will:
- ✅ Ask you politely for API keys
- ✅ Configure everything automagically
- ✅ Not judge your messy home directory

### The Hard Way (For Claude Code)

When Claude Code is doing this autonomously (hello, robot friend):

```bash
# 1. Clone it
git clone https://github.com/zhsks311/cc-orchestrator.git
cd cc-orchestrator

# 2. Install the things
npm install

# 3. Create secrets file
cat > .env << 'EOF'
# Add at least one. More is better. All three is showing off.
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...

# For the patient among us
CCO_TIMEOUT_SECONDS=300
EOF

# 4. Build it
npm run build

# 5. Tell Claude Desktop about it
```

Add to `~/.claude/claude_desktop_config.json`:

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
# 6. Optional: Install the fancy extras
cp -r hooks/* ~/.claude/hooks/
cp -r skills/* ~/.claude/skills/

# 7. Restart Claude Code and feel powerful
```

---

## 🎮 Usage

### Just... Talk To Them

```
"Hey Arch, is this architecture going to haunt me in 6 months?"

"Canvas, make this login page not look like it was designed in 2003"

"Index, find me every Express middleware gotcha ever documented"
```

### The Orchestrate Skill

For when you want to feel like a project manager:

```
/orchestrate Implement user authentication with JWT
```

The orchestrator will:
1. Break your vague request into actual steps
2. Assign each step to whoever's least likely to mess it up
3. Report back like a responsible employee

### Direct Tool Calls (For Control Freaks)

```javascript
// Launch an agent into the void
background_task({ agent: "arch", prompt: "Judge my life choices (the code ones)" })

// Check if they're still thinking
background_output({ task_id: "abc123", block: false })

// Demand answers
background_output({ task_id: "abc123", block: true })
```

---

## 💡 Pro Tips

### 1. Scout Is Free. Abuse This.

The `scout` agent uses your existing Claude quota. Zero extra cost. Perfect for:
- "Where the heck is that file?"
- "Who wrote this and why?"
- "Show me the project structure so I can pretend I understand it"

### 2. Arch Is Expensive. Use Wisely.

GPT-5.2 bills by the existential crisis. Save it for:
- Architecture decisions you'll regret later anyway
- Security reviews that make you lose sleep
- When you've tried fixing a bug 3 times and it's personal now

### 3. Parallelize Everything

Instead of this:
```
"Research the API, then design the component, then review it"
```

Try this:
```
"@all Research Stripe API, design payment form, review for security holes"
```

Three agents. One request. They'll figure it out.

---

## 🔧 Configuration

### Provider Priority

Customize who gets called first in `~/.cco/config.json`:

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
# "Call Anthropic first, then Google, then OpenAI"
export CCO_PROVIDER_PRIORITY=anthropic,google,openai

# "Arch specifically should try OpenAI, then Anthropic"
export CCO_ARCH_PROVIDERS=openai,anthropic

# "I have patience" (timeout in seconds)
export CCO_TIMEOUT_SECONDS=300
```

---

## 📦 Project Structure

```
cc-orchestrator/
├── src/                    # The TypeScript jungle
│   ├── core/               # Business logic (MCP-free zone)
│   │   ├── agents/         # Where agents live
│   │   ├── models/         # Model routing & provider wrangling
│   │   └── orchestration/  # The conductor's baton
│   ├── server/             # MCP protocol stuff
│   └── types/              # Types. So many types.
├── hooks/                  # Python automation (spicy)
├── skills/                 # Claude Code skills (extra spicy)
└── scripts/                # Setup scripts (mild)
```

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

| Problem | Cause | Solution |
|---------|-------|----------|
| MCP won't connect | Someone used `console.log` | Find it. Delete it. Never speak of this. |
| Agent stuck | API being dramatic | Check your keys. Check their status page. Curse. |
| Timeout | Model is "thinking" | Increase `CCO_TIMEOUT_SECONDS`. Get coffee. |
| No response | You broke it | `LOG_LEVEL=debug npm run dev`, then panic |

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
