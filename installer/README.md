# cc-orchestrator

One-line installer for [CC Orchestrator](https://github.com/zhsks311/cc-orchestrator) - Multi-model orchestration for Claude Code.

## Quick Start

```bash
npx cc-orchestrator@latest
```

That's it! The installer will:
1. Clone the repository to `~/.cc-orchestrator`
2. Check out the released git tag that matches the installer version
3. Install dependencies
4. Run the interactive setup wizard
5. Configure Claude Code automatically

## Usage

```bash
# Install to default location (~/.cc-orchestrator)
npx cc-orchestrator@latest

# Install to custom directory
npx cc-orchestrator@latest ./my-cco

# Update existing installation via the latest npm-published installer version
npx cc-orchestrator@latest --upgrade

# Force reinstall all components
npx cc-orchestrator@latest --force
```

## After Installation

1. **Restart Claude Code**
2. Try using the orchestrator:
   - `"ask arch to review this project"`
   - `"ask index to find React Query usage examples"`

## Update

```bash
# Option 1: Use npx
npx cc-orchestrator@latest --upgrade

# Option 2: Use npm script
cd ~/.cc-orchestrator
npm run update
```

`npm run update` checks the npm registry for the latest installer version, checks out the matching release tag, then runs `npm install` and `npm run setup -- --yes`.

## Requirements

- Node.js >= 18.0.0
- Git
- At least one API key (OpenAI, Google, or Anthropic)

## License

MIT
