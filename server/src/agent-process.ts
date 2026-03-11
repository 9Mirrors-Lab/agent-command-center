import { type Subprocess } from "bun";
import { homedir } from "node:os";
import type { SpawnConfig, AgentStatus, ToolActivity } from "@acc/shared";
import { MAX_OUTPUT_LINES, MODEL_PRICING, DEFAULT_ALLOWED_TOOLS } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { parseStreamLine } from "./stream-parser.js";

export class AgentProcess {
  readonly id: string;
  readonly sessionId: string;
  readonly config: SpawnConfig;
  readonly startTime: number;

  status: AgentStatus = "active";
  tokens = { input: 0, output: 0 };
  cost = 0;
  lastActivity: number;
  recentTools: ToolActivity[] = [];
  outputLines: string[] = [];
  currentTask?: string;

  private proc: Subprocess | null = null;
  private bus: MessageBus;

  constructor(id: string, sessionId: string, config: SpawnConfig, bus: MessageBus) {
    this.id = id;
    this.sessionId = sessionId;
    this.config = config;
    this.bus = bus;
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.currentTask = config.prompt.slice(0, 100);
  }

  async spawn(resumeSessionId?: string): Promise<void> {
    const args: string[] = ["-p", this.config.prompt];

    args.push("--output-format", "stream-json");
    args.push("--verbose");
    args.push("--session-id", resumeSessionId ?? this.sessionId);

    if (resumeSessionId) {
      args.push("--resume", resumeSessionId);
    }

    if (this.config.budget) {
      args.push("--max-budget-usd", String(this.config.budget));
    }

    if (this.config.model) {
      args.push("--model", this.config.model);
    }

    const tools = this.config.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
    for (const tool of tools) {
      args.push("--allowedTools", tool);
    }

    // Expand ~ to actual home directory
    let workDir = this.config.workDir;
    if (workDir.startsWith("~")) {
      workDir = workDir.replace(/^~/, homedir());
    }

    // Build clean env without CLAUDECODE
    const env = { ...process.env };
    delete env.CLAUDECODE;

    // Verify claude binary exists on PATH
    const claudePath = Bun.which("claude");
    if (!claudePath) {
      this.status = "errored";
      this.bus.publish({
        type: "agent:text",
        agentId: this.id,
        content: "[ERROR] 'claude' binary not found on PATH",
        timestamp: Date.now(),
      });
      this.bus.publish({
        type: "agent:status",
        agentId: this.id,
        status: "errored",
        timestamp: Date.now(),
      });
      return;
    }

    this.proc = Bun.spawn(["claude", ...args], {
      cwd: workDir,
      stdout: "pipe",
      stderr: "pipe",
      env,
    });

    this.status = "active";
    this.lastActivity = Date.now();

    // Read stdout NDJSON stream
    this.readStream();

    // Read stderr for debugging
    this.readStderr();

    // Monitor process exit
    this.proc.exited.then((code) => {
      if (this.status === "active") {
        this.status = code === 0 ? "idle" : "errored";
      }
      this.bus.publish({
        type: "agent:status",
        agentId: this.id,
        status: this.status,
        timestamp: Date.now(),
      });
      this.proc = null;
    });
  }

  private async readStream(): Promise<void> {
    if (!this.proc?.stdout) return;

    const reader = this.proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const msgs = parseStreamLine(line, this.id);
          for (const msg of msgs) {
            this.handleBusMessage(msg);
            this.bus.publish(msg);
          }
        }
      }
    } catch (err) {
      console.error(`[agent:${this.id}] stream read error:`, err);
    }
  }

  private async readStderr(): Promise<void> {
    if (!this.proc?.stderr) return;
    const reader = this.proc.stderr.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        console.error(`[agent:${this.id}] stderr:`, text.trim());
      }
    } catch {
      // ignore
    }
  }

  private handleBusMessage(msg: any): void {
    this.lastActivity = Date.now();

    switch (msg.type) {
      case "agent:text":
        this.outputLines.push(msg.content);
        if (this.outputLines.length > MAX_OUTPUT_LINES) {
          this.outputLines = this.outputLines.slice(-MAX_OUTPUT_LINES);
        }
        break;

      case "agent:tool_use":
        this.recentTools.push({
          tool: msg.tool,
          target: msg.target,
          status: "running",
          startTime: msg.timestamp,
        });
        if (this.recentTools.length > 20) {
          this.recentTools = this.recentTools.slice(-20);
        }
        break;

      case "agent:tool_result": {
        const tool = this.recentTools.findLast((t) => t.status === "running");
        if (tool) {
          tool.status = msg.success ? "completed" : "error";
          tool.endTime = msg.timestamp;
        }
        break;
      }

      case "agent:tokens":
        this.tokens.input += msg.input;
        this.tokens.output += msg.output;
        const model = this.config.model ?? "sonnet";
        const pricing = MODEL_PRICING[model] ?? MODEL_PRICING.sonnet;
        this.cost = this.tokens.input * pricing.input + this.tokens.output * pricing.output;
        break;

      case "agent:status":
        this.status = msg.status;
        break;
    }
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.status = "stopped";
    }
  }

  isAlive(): boolean {
    return this.proc !== null;
  }

  toState() {
    return {
      id: this.id,
      name: this.config.name ?? `Agent ${this.id.slice(0, 6)}`,
      status: this.status,
      config: this.config,
      sessionId: this.sessionId,
      pid: this.proc?.pid,
      tokens: { ...this.tokens },
      cost: this.cost,
      startTime: this.startTime,
      lastActivity: this.lastActivity,
      currentTask: this.currentTask,
      recentTools: [...this.recentTools.slice(-5)],
      outputLines: this.outputLines.slice(-50),
    };
  }
}
