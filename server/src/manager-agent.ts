import type { AgentState, ManagerMode } from "@acc/shared";
import { MANAGER_INTERVAL_MS, STALL_THRESHOLD_MS } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { AgentManager } from "./agent-manager.js";

export class ManagerAgent {
  private bus: MessageBus;
  private agentManager: AgentManager;
  private interval: ReturnType<typeof setInterval> | null = null;
  mode: ManagerMode = "observe";
  enabled = false;

  constructor(bus: MessageBus, agentManager: AgentManager) {
    this.bus = bus;
    this.agentManager = agentManager;
  }

  start(): void {
    if (this.interval) return;
    this.enabled = true;

    // Run immediately, then on interval
    this.tick();
    this.interval = setInterval(() => this.tick(), MANAGER_INTERVAL_MS);
    console.log("[manager] started, interval:", MANAGER_INTERVAL_MS, "ms");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.enabled = false;
  }

  private async tick(): Promise<void> {
    const agents = this.agentManager.getAll();
    if (agents.length === 0) return;

    // Build summary prompt
    const prompt = this.buildPrompt(agents);

    try {
      // Call claude in headless mode for summarization
      const env = { ...process.env };
      delete env.CLAUDECODE;

      const proc = Bun.spawn(
        ["claude", "-p", prompt, "--output-format", "json", "--model", "haiku"],
        { stdout: "pipe", stderr: "pipe", env }
      );

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      let result: string;
      try {
        const parsed = JSON.parse(output);
        result = parsed.result ?? output;
      } catch {
        result = output;
      }

      // Parse the manager's response and publish to bus
      this.publishSummary(result, agents);

    } catch (err) {
      console.error("[manager] tick error:", err);
    }
  }

  private buildPrompt(agents: AgentState[]): string {
    const now = Date.now();
    const agentDescriptions = agents.map((a) => {
      const uptime = Math.round((now - a.startTime) / 1000);
      const sinceActivity = Math.round((now - a.lastActivity) / 1000);
      const stalled = a.status === "active" && (now - a.lastActivity) > STALL_THRESHOLD_MS;

      const recentToolsStr = a.recentTools
        .slice(-3)
        .map((t) => `${t.status === "running" ? "⏳" : t.status === "completed" ? "✓" : "✗"} ${t.tool}${t.target ? `: ${t.target}` : ""}`)
        .join(", ");

      return [
        `Agent "${a.name}" (${a.config.model ?? "sonnet"}, ${a.status}, ${uptime}s uptime):`,
        `  Task: "${a.currentTask ?? "unknown"}"`,
        `  Recent tools: ${recentToolsStr || "none"}`,
        `  Tokens: ${a.tokens.input} in, ${a.tokens.output} out ($${a.cost.toFixed(3)})`,
        stalled ? `  ⚠️ No activity in ${sinceActivity}s` : null,
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    return `You are the manager agent for an Agent Command Center. Provide a brief team status.

Current agents:

${agentDescriptions}

Respond in this exact JSON format (no markdown):
{
  "summary": "one-line overall team status",
  "agents": [
    {"agentId": "id", "assessment": "on-track|stalled|needs-attention|done|errored", "note": "brief note"}
  ],
  "alerts": [
    {"agentId": "id", "alert": "description", "severity": "info|warn|error"}
  ]
}`;
  }

  private publishSummary(result: string, agents: AgentState[]): void {
    const now = Date.now();

    try {
      const parsed = JSON.parse(result);

      // Publish summary
      this.bus.publish({
        type: "manager:summary",
        summary: parsed.summary ?? "No summary available",
        agentStates: (parsed.agents ?? []).map((a: any) => ({
          agentId: a.agentId,
          assessment: a.assessment ?? "on-track",
          note: a.note ?? "",
        })),
        timestamp: now,
      });

      // Publish alerts
      for (const alert of parsed.alerts ?? []) {
        this.bus.publish({
          type: "manager:alert",
          agentId: alert.agentId ?? "",
          alert: alert.alert,
          severity: alert.severity ?? "info",
          timestamp: now,
        });
      }
    } catch {
      // Couldn't parse structured output, publish raw summary
      this.bus.publish({
        type: "manager:summary",
        summary: result.slice(0, 200),
        agentStates: [],
        timestamp: now,
      });
    }
  }
}
