import type { AgentState, SpawnConfig, BusMessage, RuntimeType } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { AgentProcess } from "./agent-process.js";
import { addToStore, removeFromStore, type StoredAgent } from "./session-store.js";
import { MachineRegistry } from "./machine-registry.js";

export class AgentManager {
  private agents = new Map<string, AgentProcess>();
  private bus: MessageBus;
  private machineRegistry: MachineRegistry;

  constructor(bus: MessageBus, machineRegistry?: MachineRegistry) {
    this.bus = bus;
    this.machineRegistry = machineRegistry ?? new MachineRegistry();

    // Subscribe to bus commands
    bus.subscribe((msg) => this.handleBusMessage(msg));
  }

  private handleBusMessage(msg: BusMessage): void {
    switch (msg.type) {
      case "user:spawn":
        this.spawn(msg.config);
        break;
      case "agent:stop":
      case "user:message": // stop via user message handled below
        if (msg.type === "agent:stop") this.stop(msg.agentId);
        break;
      case "agent:resume":
        this.resume(msg.agentId);
        break;
      case "agent:prompt":
        // For now, stop and re-spawn with new prompt using resume
        this.promptAgent(msg.agentId, msg.prompt);
        break;
      case "user:broadcast":
        // Send to all active agents
        for (const [id, agent] of this.agents) {
          if (agent.status === "active" || agent.status === "idle") {
            this.promptAgent(id, msg.message);
          }
        }
        break;

      case "agent:delegate":
        this.handleDelegation(msg.agentId, msg.task, msg.model, (msg as any).runtime);
        break;

      case "agent:status":
        // When a worker finishes, send results back to parent
        if (msg.status === "idle") {
          this.handleWorkerCompletion(msg.agentId);
        }
        break;
    }
  }

  getMachineRegistry(): MachineRegistry {
    return this.machineRegistry;
  }

  async spawn(config: SpawnConfig): Promise<string> {
    const id = crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    const machine = config.machine ? this.machineRegistry.getMachine(config.machine) : undefined;
    const agent = new AgentProcess(id, sessionId, config, this.bus, machine);
    this.agents.set(id, agent);

    this.bus.publish({
      type: "agent:spawned",
      agentId: id,
      config,
      timestamp: Date.now(),
    });

    await agent.spawn();

    // Persist agent config for recovery
    this.persistAgent(agent);

    return id;
  }

  stop(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.stop();
    this.persistAgent(agent);

    this.bus.publish({
      type: "agent:stopped",
      agentId,
      reason: "user",
      timestamp: Date.now(),
    });
  }

  async resume(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.isAlive()) return;

    await agent.spawn(agent.sessionId);
    this.bus.publish({
      type: "agent:status",
      agentId,
      status: "active",
      timestamp: Date.now(),
    });
  }

  async promptAgent(agentId: string, prompt: string): Promise<void> {
    const existing = this.agents.get(agentId);
    if (!existing) return;

    // Stop existing process if alive
    if (existing.isAlive()) {
      existing.stop();
    }

    // Re-spawn with new prompt, resuming the session
    const newConfig = { ...existing.config, prompt };
    const agent = new AgentProcess(agentId, existing.sessionId, newConfig, this.bus);
    // Carry over accumulated state from the original process
    agent.tokens = { ...existing.tokens };
    agent.cost = existing.cost;
    agent.outputLines = [...existing.outputLines];
    // Preserve original startTime so uptime tracking stays accurate
    (agent as any).startTime = existing.startTime;
    this.agents.set(agentId, agent);

    await agent.spawn(existing.sessionId);
  }

  private async handleDelegation(parentId: string, task: string, model?: string, runtime?: RuntimeType): Promise<void> {
    const parent = this.agents.get(parentId);
    if (!parent) return;

    const workerConfig: SpawnConfig = {
      prompt: task,
      workDir: parent.config.workDir,
      name: `Worker: ${task.slice(0, 40)}`,
      model: (model as SpawnConfig["model"]) ?? parent.config.model ?? "sonnet",
      runtime: runtime ?? parent.config.runtime ?? "claude",
      role: "worker",
      workerAssignment: {
        parentId,
        taskDescription: task,
        assignedAt: Date.now(),
      },
    };

    await this.spawn(workerConfig);
  }

  private handleWorkerCompletion(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent || agent.config.role !== "worker" || !agent.config.workerAssignment) return;

    const { parentId, taskDescription } = agent.config.workerAssignment;
    const summary = agent.outputLines.slice(-20).join("\n");

    this.bus.publish({
      type: "agent:worker-result",
      agentId,
      parentId,
      summary,
      timestamp: Date.now(),
    });

    // Forward condensed results to parent coordinator
    const parent = this.agents.get(parentId);
    if (parent && parent.isAlive()) {
      this.promptAgent(parentId, `Worker completed task "${taskDescription}":\n\n${summary}`);
    }
  }

  remove(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent?.isAlive()) agent.stop();
    this.agents.delete(agentId);
    removeFromStore(agentId);
  }

  private persistAgent(agent: AgentProcess): void {
    const stored: StoredAgent = {
      id: agent.id,
      sessionId: agent.sessionId,
      name: agent.config.name ?? `Agent ${agent.id.slice(0, 6)}`,
      config: agent.config,
      tokens: { ...agent.tokens },
      cost: agent.cost,
      startTime: agent.startTime,
      stoppedAt: agent.status === "stopped" ? Date.now() : undefined,
    };
    addToStore(stored);
  }

  /** Stop all agents — used for graceful shutdown */
  stopAll(): void {
    for (const [id, agent] of this.agents) {
      if (agent.isAlive()) {
        agent.stop();
        this.persistAgent(agent);
      }
    }
  }

  getAll(): AgentState[] {
    return Array.from(this.agents.values()).map((a) => a.toState());
  }

  get(agentId: string): AgentState | undefined {
    return this.agents.get(agentId)?.toState();
  }

  getStats() {
    const agents = this.getAll();
    return {
      total: agents.length,
      active: agents.filter((a) => a.status === "active").length,
      idle: agents.filter((a) => a.status === "idle").length,
      stopped: agents.filter((a) => a.status === "stopped" || a.status === "errored").length,
      totalTokens: agents.reduce((acc, a) => ({
        input: acc.input + a.tokens.input,
        output: acc.output + a.tokens.output,
      }), { input: 0, output: 0 }),
      totalCost: agents.reduce((acc, a) => acc + a.cost, 0),
    };
  }
}
