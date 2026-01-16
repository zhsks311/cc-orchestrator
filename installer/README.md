# cc-orchestrator

One-line installer for [CC Orchestrator](https://github.com/zhsks311/cc-orchestratorestrator) - Multi-model orchestration for Claude Code.

## Quick Start

```bash
npx cc-orchestrator
```

That's it! The installer will:
1. Clone the repository to `~/.cc-orchestratorestrator`
2. Install dependencies
3. Run the interactive setup wizard
4. Configure Claude Code automatically

## Usage

```bash
# Install to default location (~/.cc-orchestratorestrator)
npx cc-orchestrator

# Install to custom directory
npx cc-orchestrator ./my-cco

# Update existing installation
npx cc-orchestrator --upgrade

# Force reinstall all components
npx cc-orchestrator --force
```

## After Installation

1. **Restart Claude Code**
2. Try using the orchestrator:
   - `"ask arch to review this project"`
   - `"ask index to find React Query usage examples"`

## Update

```bash
# Option 1: Use npx
npx cc-orchestrator --upgrade

# Option 2: Use npm script
cd ~/.cc-orchestratorestrator
npm run update
```

## Requirements

- Node.js >= 18.0.0
- Git
- At least one API key (OpenAI, Google, or Anthropic)

## License

MIT
