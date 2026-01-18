# CC Orchestrator Architecture

This document describes the architecture of the CC Orchestrator MCP Server.

## Overview

CC Orchestrator is a **multi-LLM orchestration server** built on the Model Context Protocol (MCP). It manages the lifecycle, routing, and execution of specialized agents powered by different LLM providers (OpenAI, Google, Anthropic).

### Core Design Principles

1. **Fire-and-Forget Execution**: Agent creation returns immediately; execution runs in background
2. **Provider Abstraction**: Unified interface with intelligent fallbacks across providers
3. **Non-Blocking**: Claude Code must not block; users explicitly wait with `block=true`
4. **Interface-First Design**: All major components define interfaces before implementation

## Directory Structure

```
src/
├── core/                    # Pure business logic (no MCP dependency)
│   ├── agents/             # Agent lifecycle & execution
│   │   ├── AgentManager.ts
│   │   └── prompts.ts
│   ├── models/             # LLM provider integration
│   │   ├── ModelRouter.ts
│   │   ├── ProviderHealthManager.ts
│   │   └── providers/
│   │       ├── OpenAIProvider.ts
│   │       ├── GoogleProvider.ts
│   │       └── AnthropicProvider.ts
│   ├── orchestration/      # Multi-agent workflow execution
│   │   └── OrchestrationEngine.ts
│   ├── routing/            # Intent-based agent selection
│   │   └── IntentAnalyzer.ts
│   ├── context/            # Session-scoped data sharing
│   │   └── ContextStore.ts
│   └── ast/                # Code analysis
│       └── AstGrepService.ts
├── server/                 # MCP protocol handling
│   ├── MCPServer.ts
│   ├── handlers/
│   │   └── index.ts
│   └── tools/
│       ├── definitions.ts
│       └── schemas.ts
├── types/                  # Type definitions & errors
│   ├── agent.ts
│   ├── model.ts
│   ├── errors.ts
│   └── ...
└── infrastructure/         # Cross-cutting concerns
    ├── Logger.ts
    ├── ConfigLoader.ts
    └── RetryStrategy.ts
```

**Dependency Rule**: `core/` must not import from `server/` (unidirectional dependency).

## Core Components

### 1. MCPServer

Entry point for MCP protocol communication.

```
MCPServer
├─ AgentManager (manages agent lifecycle)
├─ ContextStore (manages session context)
├─ ModelRouter (selects LLM providers)
└─ ToolHandlers (executes MCP tools)
```

**Responsibilities:**
- Initialize core components
- Handle MCP ListTools & CallTool requests
- Route tool calls to handlers
- Manage session lifecycle & cleanup

### 2. AgentManager

Manages agent lifecycle and execution.

**Data Structures:**
```typescript
agents: Map<agentId, Agent>           // In-memory agent store
idempotencyCache: Map<key, agentId>   // Idempotency support
executionPromises: Map<agentId, Promise> // Track async execution
```

**Agent Lifecycle:**
```
QUEUED → RUNNING → COMPLETED
                ↘ FAILED
                ↘ CANCELLED
                ↘ TIMEOUT
```

**Key Methods:**
- `createAgent(params)`: Create & queue agent (returns immediately)
- `getAgent(agentId)`: Retrieve agent by ID
- `waitForCompletion(agentId, timeoutMs)`: Block until completion
- `cancelAgent(agentId)`: Cancel agent (if not terminal)

### 3. ModelRouter

Intelligent provider selection with runtime fallbacks.

**Fallback Strategy (3-tier):**
```
Tier 1: Primary model within provider
Tier 2: Fallback model within same provider
Tier 3: Provider fallbacks (cross-provider)
```

**Agent-to-Model Mapping:**
```typescript
ROLE_MODEL_MAPPING = {
  arch: { provider: OPENAI, model: 'gpt-5.2', fallbacks: [...] },
  canvas: { provider: GOOGLE, model: 'gemini-3-pro', fallbacks: [...] },
  index: { provider: ANTHROPIC, model: 'claude-sonnet-4-5', fallbacks: [...] },
  // ...
}
```

### 4. ProviderHealthManager

Circuit breaker & health tracking for providers.

**Health State:**
```typescript
interface ProviderState {
  available: boolean
  consecutiveErrors: number
  lastError?: Date
  lastSuccess?: Date
  cooldownUntil?: Date
  circuitOpen: boolean
}
```

**Thresholds:**
- `MAX_CONSECUTIVE_ERRORS`: 3 failures → circuit breaker opens
- `CIRCUIT_RESET_MS`: 5 minutes
- `DEFAULT_COOLDOWN_MS`: 1 minute (rate limit)

### 5. ContextStore

Session & global scoped context sharing between agents.

**Scopes:**
- `SESSION`: Per-session, auto-cleanup
- `GLOBAL`: Across sessions, manual cleanup

**Features:**
- TTL support for automatic expiration
- Access count tracking
- Automatic cleanup scheduler (every 5 minutes)

### 6. RetryStrategy

Exponential backoff retry utility with intelligent error handling.

**Features:**
- Configurable exponential backoff
- Jitter to prevent thundering herd
- Respects `CCOError.retryable` flag
- Callback hooks for monitoring

**Configuration:**
```typescript
{
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  respectRetryable: true,
}
```

## Data Flow

### Simple Agent Execution

```
Client (Claude Code)
    ↓ MCP: CallTool "background_task"
MCPServer.ToolHandlers
    ↓
AgentManager.createAgent()
    ├─ Validate input (Zod schema)
    ├─ Create agent (status: QUEUED)
    └─ Return agent immediately
    ↓ (async, non-blocking)
AgentManager.executeAgent()
    ├─ Update status: RUNNING
    ├─ Build system prompt
    └─ Call ModelRouter
        ↓
ModelRouter.executeWithFallback()
    ├─ Find available provider
    ├─ Execute with retry strategy
    └─ Return response
    ↓
AgentManager updates agent
    ├─ status: COMPLETED
    └─ result: response content
    ↓
Client polls via "background_output"
```

### Provider Selection with Fallback

```
ModelRouter.executeWithFallback()
    ├─ Get ROLE_MODEL_MAPPING[role]
    ├─ Check primary provider
    │   ├─ API key available?
    │   └─ Provider healthy?
    ├─ If unavailable, try providerFallbacks
    ├─ Execute with RetryStrategy
    │   ├─ Retry on retryable errors
    │   └─ Exponential backoff between attempts
    ├─ Update ProviderHealthManager
    └─ Return response + fallbackInfo
```

## Error Handling

### Error Class Hierarchy

```
CCOError (abstract base)
├── Client Errors (4xx, retryable=false)
│   ├── ValidationError (400)
│   ├── AgentNotFoundError (404)
│   ├── ContextNotFoundError (404)
│   └── InvalidRoleError (400)
└── Server Errors (5xx, retryable=true)
    ├── ModelAPIError (502)
    ├── TimeoutError (504)
    ├── RateLimitError (429)
    ├── ResourceExhaustedError (503)
    └── CircuitBreakerOpenError (503)
```

### Retry Behavior

1. **Automatic Retry**: Errors with `retryable=true` are automatically retried
2. **Exponential Backoff**: Delay increases exponentially between retries
3. **Max Retries**: Configurable via `CCO_MAX_RETRIES` (default: 3)
4. **Fallback**: After retry exhaustion, system falls back to alternative providers

## MCP Tools

| Tool | Description |
|------|-------------|
| `background_task` | Create and start an agent |
| `background_output` | Check status or get result |
| `background_cancel` | Cancel running agent |
| `list_tasks` | Query agents by filter |
| `share_context` | Store context data |
| `get_context` | Retrieve context data |
| `suggest_agent` | Route by intent analysis |
| `ast_search` | Search code with AST patterns |
| `ast_replace` | Replace code with AST patterns |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `GOOGLE_API_KEY` | - | Google AI API key |
| `CCO_MAX_PARALLEL_AGENTS` | 5 | Max concurrent agents |
| `CCO_MAX_RETRIES` | 3 | Max retry attempts |
| `CCO_RETRY_INITIAL_DELAY_MS` | 1000 | Initial retry delay |
| `CCO_RETRY_MAX_DELAY_MS` | 30000 | Max retry delay |
| `CCO_RETRY_BACKOFF_MULTIPLIER` | 2 | Backoff multiplier |
| `LOG_LEVEL` | info | Logging level |

## Testing

### Test Infrastructure

- **API Cost Guard**: Blocks real API calls in tests
- **Contract-Based Mocks**: Schema-validated mock implementations
- **Cost Tracker**: Estimates API costs for awareness

### Running Tests

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
npm run lint       # Run linter
npm run typecheck  # Type check
npm run ci         # Full CI pipeline
```

## Design Patterns

1. **Fire-and-Forget**: Non-blocking agent creation
2. **Circuit Breaker**: Automatic provider failure handling
3. **Retry with Backoff**: Resilient error recovery
4. **Interface-First**: Clear contracts between components
5. **Zod Validation**: Schema validation at boundaries
6. **Session Isolation**: Context scoped to sessions
