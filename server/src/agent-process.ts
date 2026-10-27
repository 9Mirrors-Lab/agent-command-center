import { type Subprocess } from "bun";
import { homedir } from "node:os";
import type { SpawnConfig, AgentStatus, ToolActivity, RuntimeType, MachineConfig } from "@acc/shared";
import { MAX_OUTPUT_LINES, MODEL_PRICING, RUNTIME_INFO } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { getRuntime } from "./runtimes/index.js";

export class AgentProcess {
  readonly id: string;
  readonly sessionId: string;
  readonly config: SpawnConfig;
  readonly startTime: number;
  readonly runtime: RuntimeType;

  status: AgentStatus = "active";
  tokens = { input: 0, output: 0 };
  cost = 0;
  lastActivity: number;
  recentTools: ToolActivity[] = [];
  outputLines: string[] = [];
  currentTask?: string;

  private proc: Subprocess | null = null;
  private bus: MessageBus;
  private machine?: MachineConfig;

  constructor(id: string, sessionId: string, config: SpawnConfig, bus: MessageBus, machine?: MachineConfig) {
    this.id = id;
    this.sessionId = sessionId;
    this.config = config;
    this.bus = bus;
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.currentTask = config.prompt.slice(0, 100);
    this.runtime = config.runtime ?? "claude";
    this.machine = machine;
  }

  async spawn(resumeSessionId?: string): Promise<void> {
    const driver = getRuntime(this.runtime);
    const runtimeInfo = RUNTIME_INFO[this.runtime];

    // Expand ~ to actual home directory
    let workDir = this.config.workDir;
    if (workDir.startsWith("~")) {
      workDir = workDir.replace(/^~/, homedir());
    }

    // Build env via driver
    const env = driver.buildEnv({ ...process.env }) as Record<string, string>;

    // Verify binary exists on PATH
    const binaryPath = Bun.which(driver.binaryName);
    if (!binaryPath) {
      this.status = "errored";
      this.bus.publish({
        type: "agent:text",
        agentId: this.id,
        content: `[ERROR] '${driver.binaryName}' binary not found on PATH`,
        partial: false,
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

    // Build args via driver
    const args = driver.buildArgs(this.config, this.sessionId, resumeSessionId);

    // Remote machine: wrap in SSH
    if (this.machine?.host) {
      const sshArgs: string[] = [];
      if (this.machine.sshKey) {
        sshArgs.push("-i", this.machine.sshKey.replace(/^~/, homedir()));
      }
      sshArgs.push("-o", "StrictHostKeyChecking=no");
      sshArgs.push("-o", "BatchMode=yes");
      const target = this.machine.user
        ? `${this.machine.user}@${this.machine.host}`
        : this.machine.host;
      sshArgs.push(target);

      // Build remote command — escape for shell
      const remoteCmd = `cd ${this.config.workDir} && ${driver.binaryName} ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`;
      sshArgs.push(remoteCmd);

      this.proc = Bun.spawn(["ssh", ...sshArgs], {
        stdout: "pipe",
        stderr: "pipe",
        env,
      });
    } else {
      // Local spawn
      this.proc = Bun.spawn([driver.binaryName, ...args], {
        cwd: workDir,
        stdout: "pipe",
        stderr: "pipe",
        env,
      });
    }

    this.status = "active";
    this.lastActivity = Date.now();

    // Read stdout stream
    this.readStream();

    // Read stderr for debugging
    this.readStderr();

    // Monitor process exit
    this.proc.exited.then((code) => {
      if (this.status === "active") {
        const failedOutput = this.outputLines.some((line) =>
          /^(Error:|Authentication required)/i.test(line.trim()),
        );
        this.status = code === 0 && !failedOutput ? "idle" : "errored";
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

    const driver = getRuntime(this.runtime);
    const reader = (this.proc.stdout as ReadableStream<Uint8Array>).getReader();
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
          const msgs = driver.parseLine(line, this.id);
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
    const reader = (this.proc.stderr as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true }).trim();
        if (!text) continue;
        console.error(`[agent:${this.id}] stderr:`, text);
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const msg = {
            type: "agent:text" as const,
            agentId: this.id,
            content: trimmed.startsWith("Error:") ? trimmed : `[stderr] ${trimmed}`,
            partial: false,
            timestamp: Date.now(),
          };
          this.handleBusMessage(msg);
          this.bus.publish(msg);
        }
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
        const tool = this.recentTools.findLast((t: ToolActivity) => t.status === "running");
        if (tool) {
          tool.status = msg.success ? "completed" : "error";
          tool.endTime = msg.timestamp;
        }
        break;
      }

      case "agent:tokens":
        this.tokens.input += msg.input;
        this.tokens.output += msg.output;
        // Only calculate cost for runtimes with known pricing (Claude)
        if (this.runtime === "claude") {
          const model = this.config.model ?? "sonnet";
          const pricing = MODEL_PRICING[model] ?? MODEL_PRICING.sonnet;
          this.cost = this.tokens.input * pricing.input + this.tokens.output * pricing.output;
        }
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
      timeline: [],
      pendingApprovals: [],
      runtime: this.runtime,
      role: this.config.role ?? "standalone",
      workerAssignment: this.config.workerAssignment,
      childAgentIds: [],
    };
  }
}
