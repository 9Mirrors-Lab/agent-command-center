# CLAUDE.md — Agent Command Center

## Project Overview

A local web dashboard for managing teams of Claude Code agents. Bus-first architecture: every component (agents, dashboard, manager AI) communicates through a typed message substrate.

## Stack

- **Server**: Bun, TypeScript
- **Client**: React 19, Vite, Tailwind CSS
- **Terminal**: xterm.js + node-pty
- **Shared**: Pure TypeScript types (workspace package)

## Architecture

```
Browser ←WebSocket→ MessageBus ←child_process→ claude -p --output-format stream-json
                        ↑
                   ManagerAgent (periodic AI summarizer)
```

## Commands

```bash
bun install                    # Install all workspace deps
bun run dev:server             # Start server on :4200
bun run dev:client             # Start Vite dev server on :4201
bun run dev                    # Both (via concurrently)
bun run build                  # Build client for production

# Environment
ACC_PORT=4200                  # Server port
ACC_CLIENT_PORT=4201           # Vite dev client port
ACC_MANAGER=1                  # Enable manager agent on startup
```

## Key Files

- `shared/src/types.ts` — BusMessage union type, AgentState, SpawnConfig
- `server/src/bus.ts` — In-process typed EventEmitter
- `server/src/agent-process.ts` — Wraps single claude CLI child process
- `server/src/stream-parser.ts` — Parses Claude NDJSON stream format
- `server/src/manager-agent.ts` — AI observer that summarizes team status
- `client/src/hooks/useAgents.ts` — Central frontend state (reducer + WebSocket)
- `client/src/hooks/useBus.ts` — WebSocket connection with auto-reconnect

## Conventions

- All inter-component communication goes through the MessageBus
- The REST API is a thin convenience layer; real-time goes through WebSocket
- Dark theme: bg=#0d1117, surface=#161b22, accent=#58a6ff
- Agent processes unset CLAUDECODE env var to avoid nesting guard
