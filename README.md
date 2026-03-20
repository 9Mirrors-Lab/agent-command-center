# Agent Command Center

A bus-first web dashboard for managing teams of AI coding agents. Run Claude Code, Codex, Cursor, and OpenCode side by side with automatic sub-agent delegation, remote machine targeting via SSH, and an AI observer that detects stalls and suggests interventions.

## Quick Start

```bash
# Install dependencies
bun install

# Start the server (spawns agents, manages bus)
bun run dev:server

# In another terminal, start the dashboard
bun run dev:client

# Open http://localhost:5173
```

Or run both at once:

```bash
bun run dev
```

On first load, the dashboard shows a setup screen — enter your server URL (`http://localhost:4200` by default) and test the connection.

## What It Does

- **Multi-agent grid** — Run multiple agents simultaneously in a responsive tiled layout with live status indicators
- **Multi-runtime** — Claude Code (multi-turn), Codex, Cursor Agent, OpenCode (one-shot) all supported
- **Coordinator/worker delegation** — A coordinator agent (Opus) can autonomously spawn sub-agents for focused tasks. Workers return condensed results, not full transcripts
- **Three view modes** — Grid (default), Pipeline (horizontal DAG showing delegation chains), Focus (single agent full-screen)
- **Remote machine targeting** — Agents can target local or remote machines via SSH. Configure machines in `~/.agent-command-center/config.toml`
- **AI observer** — Detects stalled agents, excessive exploration, wrong model usage, and suggests interventions (fork sub-agent, switch model, retry)
- **Manager agent** — Periodic AI summarizer (haiku) that monitors team health and assesses each agent
- **Approval gates** — Accept/reject agent plans and permission requests from the dashboard
- **Context timeline** — Track task phases, tool batches, decisions, and errors per agent
- **Embedded terminal** — xterm.js shell per agent's working directory
- **Keyboard-driven** — Full keyboard navigation for power users

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
| Cursor Agent | One-shot per prompt | `cursor-agent --yolo` |
| OpenCode | One-shot per prompt | `opencode run` |

The runtime is selected when spawning an agent. Claude Code provides full NDJSON streaming with token tracking and cost calculation. Other runtimes stream plain text output.

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

When spawning an agent, select the target machine from the dropdown. Remote agents spawn via SSH with stdout piped back to the dashboard.

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
| `v` | Cycle view mode (grid / pipeline / focus) |
| `1-9` | Select agent by index |
| `Escape` | Close dialog / deselect |

## Deploy Dashboard to Vercel

The dashboard is a static React app that connects to your local server. You can host it on Vercel for easy access from any device on your network.

### Steps

1. **Fork or push** this repo to GitHub

2. **Import to Vercel** — go to [vercel.com/new](https://vercel.com/new), select the repo. The `vercel.json` is already configured:
   - Build command: `cd client && npm install && npx vite build`
   - Output directory: `client/dist`
   - SPA rewrites enabled

3. **Deploy** — Vercel builds and deploys the static dashboard

4. **Run your local server**:
   ```bash
   cd agent-command-center
   bun install
   bun run dev:server
   ```

5. **Connect** — open the Vercel URL, enter your server address (e.g., `http://localhost:4200` or `http://<your-ip>:4200` for LAN access)

6. **Test connection** — hit "Test" to verify, then "Get Started"

> **Note:** The server spawns agent CLI processes on your machine. Your API keys and agent data stay local — the Vercel dashboard is just a UI that connects via WebSocket.

### LAN Access

To access from other devices on your network, start the server bound to all interfaces:

```bash
ACC_PORT=4200 bun run dev:server
```

Then use your machine's local IP as the server URL (e.g., `http://192.168.1.100:4200`).

## Development

### Project Structure

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
│   ├── runtimes/        # Runtime drivers (claude, codex, cursor, opencode)
│   ├── stream-parser.ts # Claude NDJSON parser
│   ├── delegation-detector.ts
│   ├── machine-registry.ts
│   ├── manager-agent.ts
│   ├── observer-agent.ts
│   └── ...
├── client/src/          # React + Vite + Tailwind
│   ├── App.tsx
│   ├── hooks/           # useBus, useAgents, useKeyboard
│   └── components/      # AgentGrid, PipelineView, FocusView, etc.
├── vercel.json          # Vercel deployment config
└── package.json         # Bun workspace root
```

### Adding a New Runtime

1. Create `server/src/runtimes/myruntime.ts` implementing the `RuntimeDriver` interface:
   ```typescript
   export const myRuntimeDriver: RuntimeDriver = {
     binaryName: "my-cli",
     isMultiTurn: false,
     buildArgs(config, sessionId, resumeId) { ... },
     parseLine(line, agentId) { ... },
     buildEnv(env) { ... },
   };
   ```

2. Register it in `server/src/runtimes/index.ts`

3. Add runtime info to `shared/src/constants.ts` `RUNTIME_INFO`

4. Add to `shared/src/types.ts` `RuntimeType` union

### Build Commands

```bash
bun install              # Install workspace dependencies
bun run dev:server       # Server with hot reload (:4200)
bun run dev:client       # Vite dev server (:5173)
bun run dev              # Both
bun run build            # Build client to client/dist/
```

## License

MIT
