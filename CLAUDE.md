# CC Orchestrator Development Guide

Development guide for the runtime-first rewrite.

The target product is a host-neutral orchestration core for coding agent CLIs.
MCP remains the first host integration layer, but it is not the architectural center.

## Core Constraints

### Language Rule

**All code, comments, commit messages, and documentation must be written in English.**

Exception: Language-specific README files (README.ko.md, etc.)

### Code Block Rule

**Always add language specifier to code blocks.**

```markdown
<!-- ✗ Bad -->
```
const x = 1;
```

<!-- ✓ Good -->
```typescript
const x = 1;
```
```

### MCP Protocol

```text
stdout = MCP JSON-RPC only (never use console.log)
stderr = logging only (use Logger class)
```

Using `console.log` breaks the MCP protocol. Always use `Logger`.

### Rewrite Direction

The repository still contains legacy provider-based code and Claude-specific setup flows.

During the rewrite:

- prefer runtime/session/debate terminology over provider/model terminology
- keep `src/core/` independent from MCP specifics
- treat `~/.claude/` installation paths as legacy migration targets, not future architecture

### Async Execution Pattern

Agent execution follows **fire-and-forget** pattern:

```typescript
// createAgent() returns immediately
const agent = await this.agentManager.createAgent(params);
// Execution runs in background
// Track Promise in executionPromises Map
```

The host must not block. Users can explicitly wait with `block=true`.

### Terminal States

```typescript
private isTerminalStatus(status: AgentStatus): boolean {
  return [COMPLETED, FAILED, CANCELLED, TIMEOUT].includes(status);
}
```

Agents in terminal state cannot be cancelled/modified. Always check before operating.

## Code Conventions

### Interface First

```typescript
// Always define interface first
export interface IAgentManager {
  createAgent(params: CreateAgentParams): Promise<Agent>;
}

// Class implements interface
export class AgentManager implements IAgentManager {
```

### Error Class Hierarchy

```typescript
CCOError (abstract base)
├── Client Errors (4xx, retryable=false)
│   ├── ValidationError (400)
│   ├── AgentNotFoundError (404)
│   └── InvalidRoleError (400)
└── Server Errors (5xx, retryable=true)
    ├── ModelAPIError (502)
    ├── TimeoutError (504)
    └── RateLimitError (429)
```

Use `retryable` flag to indicate retry eligibility.

```typescript
// Good: specific error class
throw new AgentNotFoundError(agentId);

// Bad: generic Error
throw new Error(`Agent ${agentId} not found`);
```

### Zod Schema Validation

Validate all tool inputs at first line of handler:

```typescript
private async handleBackgroundTask(args: unknown): Promise<ToolResult> {
  const input = BackgroundTaskInputSchema.parse(args);  // first line
  // ...
}
```

### Tool Response Format

```typescript
// Success
return this.formatResult({ task_id: agent.id, status: 'running' });

// Failure (includes isError: true)
return this.formatError(error);
```

### Logging

```typescript
this.logger.info('Agent created', {
  agentId: agent.id,
  role: agent.role,
  sessionId: agent.sessionId,
});
// Sensitive info (apiKey, password, token, secret) is auto-masked
```

### Naming

| Type | Convention | Example |
|------|------------|---------|
| Class | PascalCase | `AgentManager` |
| Interface | I + PascalCase | `IAgentManager` |
| Method | camelCase | `createAgent` |
| Constant | UPPER_SNAKE | `AgentStatus.RUNNING` |
| Filename | PascalCase.ts | `AgentManager.ts` |

### Import Order

```typescript
// 1. External packages
import { v4 as uuidv4 } from 'uuid';

// 2. Internal types/errors
import { Agent, AgentStatus } from '../../types/index.js';
import { AgentNotFoundError } from '../../types/errors.js';

// 3. Internal modules
import { ModelRouter } from '../models/ModelRouter.js';
import { Logger } from '../../infrastructure/Logger.js';
```

**ESM requires `.js` extension.**

## Directory Structure

```text
src/core/           # Pure business logic (no MCP dependency)
src/server/         # MCP protocol handling
src/types/          # Types + error definitions
src/infrastructure/ # Logging, common utilities
```

`core/` must not import from `server/` (unidirectional dependency).

## Migration Workflow

When developing the rewrite, follow this order:

### 1. Develop in Project (Source of Truth)

```text
cc-orchestrator/
├── src/core/       # Runtime-first orchestration core
├── src/server/     # MCP host adapter
├── src/types/      # Runtime/session/debate types
└── scripts/        # Install/bootstrap scripts
```

**All code is written and tested in this project first.**

### 2. Keep Host Adapters Thin

`src/server/` may evolve, but business rules belong in `src/core/`.

### 3. Development Cycle

```text
[Edit in project] → [Run focused tests] → [Run full verification] → [Commit]
```

Legacy installation steps that copy files into `~/.claude/` are migration notes only.

### Legacy Install Mapping

The old `~/.claude/` mapping is still present in parts of the repository, but it should not guide new architecture decisions.

## Package Structure

This project has two package.json files with different purposes:

```
cc-orchestrator/
├── package.json              ← "cc-orchestrator-server" (private, not published)
├── src/                      ← MCP server code
├── hooks/                    ← Claude Code hooks
├── skills/                   ← Claude Code skills
├── agents/                   ← Claude Code agents
├── scripts/setup.mjs         ← Installs components to ~/.claude/
└── installer/
    ├── package.json          ← "cc-orchestrator" (published to npm)
    └── index.js              ← CLI that clones repo and runs setup
```

### Why Two Packages?

| Package | npm Name | Published | Purpose |
|---------|----------|-----------|---------|
| Root | `cc-orchestrator-server` | No (`private: true`) | MCP server + hooks/skills/agents |
| Installer | `cc-orchestrator` | Yes | CLI for `npx cc-orchestrator@latest` |

### Installation Flow

```
npx cc-orchestrator@latest
    ↓
installer/index.js runs
    ↓
git clone GitHub repo → ~/.cc-orchestrator/
    ↓
npm install && npm run setup
    ↓
Components installed to ~/.claude/
```

The installer uses **git clone** (not npm install) because:
- Hooks, skills, agents need to be copied to `~/.claude/`
- MCP server runs from `~/.cc-orchestrator/`
- Simple npm package can't handle this setup

### Version Sync

Both package.json files must have the **same version**. GitHub Actions handles this automatically during publish.

## npm Publishing

```bash
# Publish current version
npm run publish

# Bump version + publish (one step)
npm run publish -- patch     # Bug fix: 0.1.1 → 0.1.2
npm run publish -- minor     # New feature: 0.1.1 → 0.2.0
npm run publish -- major     # Breaking change: 0.1.1 → 1.0.0

# Preview (no actual publish)
npm run publish -- --dry-run
```

Script automatically handles:
- npm login/git status check
- Run tests and build
- Remove `private: true` before publish
- Create git tag (on version bump)

## Adding New Features

### Adding an Agent

1. `src/types/agent.ts` → `AgentRole` enum
2. `src/types/model.ts` → `ROLE_MODEL_MAPPING`
3. `src/core/agents/prompts.ts` → System prompt + `AGENT_METADATA`

### Adding a Tool

1. `src/server/tools/definitions.ts` → Tool definition
2. `src/server/tools/schemas.ts` → Zod schema
3. `src/server/handlers/index.ts` → Switch case + handler method

## Debugging

```bash
LOG_LEVEL=debug npm run dev
```

| Symptom | Cause | Solution |
|---------|-------|----------|
| MCP connection fails | stdout pollution | Remove console.log |
| Agent fails | Missing API key | Check .env |
| Timeout | Slow response | Increase CCO_TIMEOUT_SECONDS |

## Cost Reference

- `scout`: Free (Claude 3.5 Sonnet)
- `index`: Cheap (Claude Sonnet 4.5)
- `arch`: Expensive (GPT-5.2)

Use `scout` during development.

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- tests/setup/api-guard.test.ts
```

### API Cost Guard

**CRITICAL**: The API Cost Guard prevents accidental real API calls during tests.

- **Enabled by default** via `vitest.config.ts`
- **Blocks production APIs**: OpenAI, Anthropic, Google
- **In CI**: Throws error and fails test
- **Locally**: Warns but allows execution

```typescript
// ❌ This will be blocked
await fetch('https://api.openai.com/v1/chat/completions');
// Error: 🚨 BLOCKED: Real API call detected!

// ✅ Use mocks instead
const mockProvider = vi.fn().mockResolvedValue({ content: 'mocked' });
```

### Test Structure

```
tests/
├── setup/          # Global setup (API guard, cost tracker)
├── mocks/          # Mock implementations
├── utils/          # Test utilities
└── README.md       # Full testing documentation
```

### Writing Tests

Follow these conventions:

1. **Mock external APIs**: Never call real APIs in unit tests
2. **Use descriptive names**: `should handle invalid input gracefully`
3. **Test error cases**: Don't just test happy paths
4. **Keep tests fast**: Unit tests should run in milliseconds

See `tests/README.md` for full documentation.
