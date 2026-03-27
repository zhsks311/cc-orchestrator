# CC Orchestrator Architecture

This document describes the target architecture of the runtime-first rewrite.

## Overview

CC Orchestrator is being rebuilt as a **host-neutral orchestration core for coding agent CLIs**.

The product is not "an MCP server that calls model providers." The product is:

- a runtime-first orchestration core
- a session and transcript manager
- a debate and validation coordinator
- a capability-based selector for coding agent CLIs

MCP remains the **first host integration layer**, not the architectural center.

## Core Design Principles

1. **Core Before Host**: `src/core/` must stay independent from MCP-specific request handling
2. **Sessions Over One-Shot Tasks**: the primary unit is a long-lived agent session
3. **Capability-First Selection**: worker choice is based on declared capabilities, not personas
4. **Structured Validation**: sessions can challenge each other through debate threads
5. **Evidence Preservation**: transcripts, artifacts, and debate resolutions are first-class outputs

## Target Layers

```text
Main Coding Agent
    ↓
Host Integration Layer (MCP first)
    ↓
Core Orchestration Engine
    ├─ Capability Selection
    ├─ Debate Orchestration
    ├─ Stance Simulation Planning
    └─ Result Aggregation
    ↓
Runtime Layer
    ├─ Adapter Registry
    ├─ Session Manager
    ├─ Process Supervisor
    ├─ Artifact Store
    └─ Debate Manager
    ↓
Agent CLI Adapters
    ├─ Codex
    └─ Claude Code
```

## Directory Direction

```text
src/
├── core/
│   ├── runtime/        # Adapter registry, session manager, process supervisor
│   ├── debate/         # Debate threads, stance simulation, resolution
│   ├── orchestration/  # Task decomposition, capability routing, aggregation
│   ├── agents/         # Runtime-backed agent lifecycle
│   ├── context/        # Shared orchestration context
│   └── ast/            # Local code analysis
├── server/             # MCP adapter only
│   ├── MCPServer.ts
│   ├── handlers/
│   └── tools/
├── types/              # Runtime, session, artifact, debate, errors
└── infrastructure/     # Logging, config loading, common utilities
```

`core/` must not import from `server/`.

## Core Components

### 1. Host Integration Layer

Responsibilities:

- expose MCP tools
- validate inputs
- map host requests onto core use cases
- return normalized session, debate, and artifact results

### 2. Adapter Registry

Tracks available runtime adapters and their declared capabilities.

Capabilities include:

- `planning`
- `implementation`
- `codebase_search`
- `patch_edit`
- `shell_execution`
- `multi_turn_chat`
- `debate_participation`
- `stance_simulation`

### 3. Session Manager

Tracks:

- live sessions
- transcript events
- terminal states
- linked artifacts
- per-session metadata

### 4. Debate Manager

Coordinates structured validation threads between sessions.

Thread types:

- `review`
- `debate`

Expected outputs:

- consensus summary
- key disagreements
- supporting evidence
- recommended next action

### 5. Process Supervisor

Owns child-process lifecycle for CLI adapters:

- spawn
- timeout
- cancellation
- stdout/stderr capture
- exit classification

## Data Flow

### Session Lifecycle

```text
Main agent
    ↓ start_agent_session
MCP handler
    ↓
Core use case
    ↓
Adapter registry selects runtime
    ↓
Process supervisor launches CLI session
    ↓
Session manager tracks transcript + status
```

### Validation Flow

```text
Writer session produces draft
    ↓
Debate manager opens thread
    ↓
Reviewer sessions receive structured prompt
    ↓
Each reviewer may run stance simulation
    ↓
Debate manager aggregates consensus + dissent + evidence
    ↓
Core returns structured validation result
```

## Legacy Note

The current repository still contains provider-specific files and tests. Those belong to the implementation being replaced and should be treated as migration targets, not the long-term architecture.
