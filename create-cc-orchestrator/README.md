# create-cc-orchestrator

One-line installer for [CC Orchestrator](https://github.com/zhsks311/cc-orchestrator) - Multi-model orchestration for Claude Code.

## Quick Start

```bash
npx create-cc-orchestrator
```

That's it! The installer will:
1. Clone the repository to `~/.cc-orchestrator`
2. Install dependencies
3. Run the interactive setup wizard
4. Configure Claude Code automatically

## Usage

```bash
# Install to default location (~/.cc-orchestrator)
npx create-cc-orchestrator

# Install to custom directory
npx create-cc-orchestrator ./my-cco

# Update existing installation
npx create-cc-orchestrator --upgrade

# Force reinstall all components
npx create-cc-orchestrator --force
```

## After Installation

1. **Restart Claude Code**
2. Try using the orchestrator:
   - `"oracle한테 이 프로젝트 리뷰해달라고 해"`
   - `"librarian한테 React Query 사용법 찾아줘"`

## Update

```bash
# Option 1: Use npx
npx create-cc-orchestrator --upgrade

# Option 2: Use npm script
cd ~/.cc-orchestrator
npm run update
```

## Requirements

- Node.js >= 18.0.0
- Git
- At least one API key (OpenAI, Google, or Anthropic)

## License

MIT
