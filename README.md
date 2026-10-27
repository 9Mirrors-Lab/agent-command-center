# Agent Command Center

A bus-first web dashboard for managing teams of AI coding agents. Run Claude Code, Codex, Cursor, and OpenCode side by side with automatic sub-agent delegation, remote machine targeting via SSH, and an AI observer that detects stalls and suggests interventions.

Includes built-in **Hyperliquid trading integration** — monitor accounts, positions, and strategies, and launch autonomous trading agents directly from the dashboard.

## Quick Start

```bash
bun install
bun run dev        # Starts server (:4200) + client (:4201)
# Open http://localhost:4201
```

## What It Does

### Multi-Agent Management
- **Multi-agent grid** — Run multiple agents simultaneously in a responsive tiled layout with live status indicators
- **Multi-runtime** — Claude Code (multi-turn), Codex, Cursor Agent, OpenCode (one-shot) all supported
- **Coordinator/worker delegation** — A coordinator agent (Opus) can autonomously spawn sub-agents for focused tasks. Workers return condensed results, not full transcripts
- **Three view modes** — Grid (default), Pipeline (horizontal DAG showing delegation chains), Focus (single agent full-screen)
- **Remote machine targeting** — Agents can target local or remote machines via SSH
- **AI observer** — Detects stalled agents, excessive exploration, wrong model usage, and suggests interventions
- **Manager agent** — Periodic AI summarizer (Haiku) that monitors team health and assesses each agent
- **Approval gates** — Accept/reject agent plans and permission requests from the dashboard
- **Context timeline** — Track task phases, tool batches, decisions, and errors per agent
- **Embedded terminal** — xterm.js shell per agent's working directory
- **Keyboard-driven** — Full keyboard navigation for power users

### Activity & Replay
- **Activity feed** — Real-time audit trail of all agent events (tool calls, decisions, errors, delegations)
- **Replay timeline** — Rewind and replay agent sessions to review past work
- **Workspace graph** — Visualization of agent relationships and file interactions
- **Learnings panel** — Track patterns, mistakes, and optimizations discovered by agents

### Trading Integration

Toggle "Trading" ON in the top bar to enable Hyperliquid trading features.

**Trading Panel** (4 tabs):
- **Account** — Equity, balance, unrealized P&L, margin
- **Positions** — Open positions with symbol, side, size, entry price, mark price, P&L
- **Journal** — Trade history with strategy attribution and P&L
- **Strategies** — List all available strategies, launch any with one click, trigger APEX multi-slot trading or REFLECT performance reviews

**MCP Tools Panel** — Direct access to 16 agent-cli tools grouped by category:

| Category | Tools |
|----------|-------|
| **Fast** (cached 5s) | `account`, `status`, `strategies`, `builder_status`, `wallet_list`, `setup_check` |
| **Action** | `trade`, `run_strategy`, `radar_run`, `apex_status`, `apex_run` |
| **Self-improvement** | `reflect_run`, `agent_memory`, `trade_journal`, `judge_report`, `obsidian_context` |

Each tool can be executed directly from the dashboard with JSON output displayed inline.

**Setup**: Install [agent-cli](https://github.com/Nunchi-trade/agent-cli), set `HL_PRIVATE_KEY`, and toggle Trading ON. The ACC calls `python -m cli.main <command>` via the MCP bridge.

### Auto-Detection
- **Detects running Claude Code sessions** on the local machine via `ps` + `lsof`
- Shows recent messages and working directory for each detected session
- One-click to attach or spawn a new agent in the same directory

## Architecture

```
Browser (React)
    |
    WebSocket (/ws)
    |
MessageBus (typed pub/sub)
    |
    ├── AgentProcess → claude -p --output-format stream-json
    ├── AgentProcess → codex --approval-mode full-auto -q
    ├── AgentProcess → ssh user@host "claude -p ..."
    |
    ├── McpBridge → python -m cli.main <trading command>
    ├── ManagerAgent (haiku, 30s interval)
    ├── ObserverAgent (pattern detection, 45s interval)
    ├── DelegationDetector (watches coordinator output)
    ├── ApprovalGate
    └── TimelineTracker
```

The dashboard and agents communicate through a typed message bus. The REST API is a thin convenience layer; real-time state flows through WebSocket.

## Supported Runtimes

| Runtime | Mode | CLI Command |
|---------|------|-------------|
| Claude Code | Persistent multi-turn | `claude -p --output-format stream-json` |
| Codex | One-shot per prompt | `codex --approval-mode full-auto -q` |
| Cursor Agent | One-shot per prompt | `cursor-agent -p --output-format stream-json --yolo` |

**Cursor Agent setup:** ACC does not attach to an open Cursor IDE window. It spawns the [`cursor-agent`](https://cursor.com/docs/cli) CLI in the agent working directory. Before spawning, run `cursor-agent login` in a terminal (or set `CURSOR_API_KEY` for the process that runs `bun run dev:server`). Verify with `cursor-agent about` (should show your email, not &quot;Not logged in&quot;).
| OpenCode | One-shot per prompt | `opencode run` |

## Configuration

### Machines

Configure remote machines at `~/.agent-command-center/config.toml`:

```toml
[[machines]]
name = "local"

[[machines]]
name = "gpu-box"
host = "gpu.example.com"
user = "jae"
sshKey = "~/.ssh/id_ed25519"
```

### Trading Setup

1. Install [agent-cli](https://github.com/Nunchi-trade/agent-cli): `cd ~/agent-cli && pip install -e .`
2. Set `HL_PRIVATE_KEY` environment variable
3. Toggle "Trading" ON in the ACC top bar

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACC_PORT` | `4200` | Server port |
| `ACC_MANAGER` | `0` | Enable manager agent on startup (`1` = on) |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `n` | Spawn new agent |
| `j` / `k` | Navigate down / up |
| `Enter` | Select agent |
| `s` | Stop agent |
| `r` | Resume agent |
| `b` | Open broadcast bar |
| `m` | Toggle manager |
| `v` | Cycle view mode (grid / pipeline / focus / activity / graph) |
| `1-9` | Select agent by index |
| `Escape` | Close dialog / deselect |

## API Endpoints

### Agent Management
| Endpoint | Description |
|----------|-------------|
| `GET /api/agents` | All managed agents + stats |
| `POST /api/agents` | Spawn new agent |
| `POST /api/agents/:id/stop` | Stop agent |
| `POST /api/agents/:id/resume` | Resume agent |
| `POST /api/agents/:id/prompt` | Send prompt to agent |
| `GET /api/agents/:id/output` | Full output history |
| `DELETE /api/agents/:id` | Remove agent |

### Trading
| Endpoint | Description |
|----------|-------------|
| `GET /api/trading/available` | Check if agent-cli is connected |
| `GET /api/trading/account` | Account stats (equity, balance, margin) |
| `GET /api/trading/status` | Open positions + P&L |
| `GET /api/trading/journal` | Trade history |
| `GET /api/trading/strategies` | Available strategies |
| `POST /api/trading/run` | Launch a strategy |
| `POST /api/trading/reflect` | Run performance review |
| `GET /api/mcp/tools` | List all MCP tools |
| `POST /api/mcp/call` | Execute any MCP tool by name |

### Other
| Endpoint | Description |
|----------|-------------|
| `GET /api/sessions/detect` | Detect running Claude sessions |
| `GET /api/machines` | List configured machines |
| `GET /api/activity` | Activity audit trail |
| `GET /api/learnings` | Stored learnings |
| `GET /api/approvals` | Pending approval gates |
| `GET /api/observer/suggestions` | Observer suggestions |

## Deploy

### Local Development
```bash
bun install
bun run dev:server       # Server with hot reload (:4200)
bun run dev:client       # Vite dev server (:4201)
bun run dev              # Both
bun run build            # Build client to client/dist/
```

### Vercel (Dashboard Only)
The dashboard is a static React app that connects to your local server. Deploy to Vercel for easy access from any device.

1. Push to GitHub
2. Import to [Vercel](https://vercel.com/new) — `vercel.json` is pre-configured
3. Run `bun run dev:server` locally
4. Open the Vercel URL, enter your server address

### LAN Access
Start the server and use your machine's local IP from other devices on the network.

## Related Projects

- **[Engineer Command Center](https://github.com/Nunchi-trade/eng-command-center)** — Extends ACC with passive session discovery, team views, cost analytics, historical dashboards, and a Strategy Lab for autonomous trading strategy research + Hyperliquid deployment
- **[agent-cli](https://github.com/Nunchi-trade/agent-cli)** — Hyperliquid trading CLI that powers the ACC's trading integration
- **[auto-researchtrading](https://github.com/Nunchi-trade/auto-researchtrading)** — Karpathy-style autonomous trading strategy discovery (used by ECC's Strategy Lab)

## Project Structure

```
agent-command-center/
├── shared/src/          # Types and constants (workspace package)
│   ├── types.ts         # BusMessage, AgentState, SpawnConfig, etc.
│   └── constants.ts     # Pricing, runtime info, defaults
├── server/src/          # Bun server
│   ├── index.ts         # HTTP/WS server, static serving
│   ├── bus.ts           # Typed pub/sub message bus
│   ├── agent-process.ts # Spawns CLI processes via runtime drivers
│   ├── agent-manager.ts # Agent lifecycle management
│   ├── mcp-bridge.ts    # Trading CLI integration (16 tools)
│   ├── runtimes/        # Runtime drivers (claude, codex, cursor, opencode)
│   ├── stream-parser.ts # Claude NDJSON parser
│   ├── delegation-detector.ts
│   ├── machine-registry.ts
│   ├── manager-agent.ts
│   ├── observer-agent.ts
│   ├── activity-log.ts
│   ├── learnings-store.ts
│   └── ...
├── client/src/          # React + Vite + Tailwind
│   ├── App.tsx
│   ├── hooks/           # useBus, useAgents, useTrading, useKeyboard
│   └── components/      # AgentGrid, PipelineView, FocusView, TradingPanel, etc.
├── vercel.json          # Vercel deployment config
└── package.json         # Bun workspace root
```

## Stack

- **Server**: Bun, TypeScript
- **Client**: React 19, Vite, Tailwind CSS
- **Terminal**: xterm.js + node-pty
- **Trading**: agent-cli MCP bridge → Hyperliquid
- **Shared**: Pure TypeScript types (workspace package)

## License

MIT
