# CC Orchestrator Development Guide

MCP server for multi-LLM orchestration in Claude Code.

## Core Constraints

### Language Rule

**All code, comments, commit messages, and documentation must be written in English.**

Exception: Language-specific README files (README.ko.md, etc.)

### MCP Protocol

```
stdout = MCP JSON-RPC only (never use console.log)
stderr = logging only (use Logger class)
```

Using `console.log` breaks the MCP protocol. Always use `Logger`.

### Async Execution Pattern

Agent execution follows **fire-and-forget** pattern:

```typescript
// createAgent() returns immediately
const agent = await this.agentManager.createAgent(params);
// Execution runs in background
// Track Promise in executionPromises Map
```

Claude Code must not block. Users can explicitly wait with `block=true`.

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

```
src/core/           # Pure business logic (no MCP dependency)
src/server/         # MCP protocol handling
src/types/          # Types + error definitions
src/infrastructure/ # Logging, common utilities
```

`core/` must not import from `server/` (unidirectional dependency).

## Extension Development Workflow

When developing Claude Code extensions (Hook, Skill, Agent, MCP), follow this order:

### 1. Develop in Project (Source of Truth)

```
oh-my-claudecode/
├── hooks/          # Hook scripts
├── skills/         # Skill definitions
├── src/            # MCP server/Agent
└── scripts/        # Install/deploy scripts
```

**All code is written and tested in this project first.**

### 2. Install to Developer Environment

```bash
npm run setup        # Install to ~/.claude/
npm run setup --force  # Force reinstall
```

Setup script copies/links project files to developer environment (`~/.claude/`).

### 3. Development Cycle

```
[Edit in project] → [npm run setup] → [Test in Claude Code] → [Commit]
```

**Never edit directly in `~/.claude/`.** Project is always the source of truth.

### Directory Mapping

| Project | Install Location | Purpose |
|---------|------------------|---------|
| `hooks/` | `~/.claude/hooks/` | Hook scripts |
| `skills/` | `~/.claude/skills/` | Skill definitions |
| `hooks/config.json` | `~/.claude/settings.json` (merge) | Hook settings |

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
