import type { ServerWebSocket } from "bun";

// node-pty is optional — if it fails to load, PTY terminals are disabled
let nodePty: typeof import("node-pty") | null = null;
try {
  nodePty = await import("node-pty");
} catch {
  console.warn("[pty-manager] node-pty not available — terminal backend disabled");
}

interface PtySession {
  pty: import("node-pty").IPty;
  ws: ServerWebSocket<unknown> | null;
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();

  get available(): boolean {
    return nodePty !== null;
  }

  /**
   * Create or reconnect a PTY for the given agent.
   * If a PTY already exists for this agentId, attach the new WebSocket.
   * Otherwise spawn a fresh shell in workDir.
   */
  attach(agentId: string, workDir: string, ws: ServerWebSocket<unknown>): void {
    if (!nodePty) {
      ws.send(JSON.stringify({ type: "error", message: "node-pty not available" }));
      ws.close();
      return;
    }

    const existing = this.sessions.get(agentId);
    if (existing) {
      // Detach old WS if any
      existing.ws = ws;
      // Send a clear signal so the new connection starts fresh visually
      return;
    }

    // Determine shell
    const shell = process.env.SHELL || "/bin/zsh";

    let pty: import("node-pty").IPty;
    try {
      pty = nodePty.spawn(shell, [], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: workDir || process.env.HOME || "/",
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        } as Record<string, string>,
      });
    } catch (err) {
      console.error("[pty-manager] failed to spawn PTY:", err);
      ws.send(JSON.stringify({ type: "error", message: "Failed to spawn terminal" }));
      ws.close();
      return;
    }

    const session: PtySession = { pty, ws };
    this.sessions.set(agentId, session);

    // PTY output → WebSocket
    pty.onData((data: string) => {
      const currentWs = this.sessions.get(agentId)?.ws;
      if (currentWs) {
        try {
          currentWs.send(data);
        } catch {
          // WebSocket closed, ignore
        }
      }
    });

    pty.onExit(() => {
      this.sessions.delete(agentId);
    });
  }

  /**
   * Handle data from the WebSocket (user input or resize events).
   */
  handleMessage(agentId: string, message: string | Buffer): void {
    const session = this.sessions.get(agentId);
    if (!session) return;

    const raw = typeof message === "string" ? message : message.toString();

    // Check for resize messages: JSON with type "resize"
    try {
      const parsed = JSON.parse(raw);
      if (parsed.type === "resize" && parsed.cols && parsed.rows) {
        session.pty.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch {
      // Not JSON — treat as raw terminal input
    }

    session.pty.write(raw);
  }

  /**
   * Detach WebSocket from a PTY session (on WS close).
   * The PTY stays alive so the user can reconnect.
   */
  detach(agentId: string): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.ws = null;
    }
  }

  /**
   * Kill and remove a PTY session entirely.
   */
  kill(agentId: string): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(agentId);
    }
  }

  /**
   * Kill all PTY sessions (for shutdown).
   */
  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id);
    }
  }

  get sessionCount(): number {
    return this.sessions.size;
  }
}
