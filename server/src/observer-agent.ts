import type { AgentState, ObserverSuggestion, SuggestionAction, BusMessage } from "@acc/shared";
import { STALL_THRESHOLD_MS } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { AgentManager } from "./agent-manager.js";
import { TimelineTracker } from "./timeline-tracker.js";

const OBSERVER_INTERVAL_MS = 45_000; // Check every 45s
const MIN_ACTIVE_TIME_MS = 60_000;   // Don't suggest until agent has been active 1min

/**
 * Observer Agent — watches all agents and proactively suggests alternative
 * approaches. Unlike the manager (which summarizes), the observer analyzes
 * behavior patterns and recommends interventions:
 *
 * - Fork a sub-agent to try a different approach in parallel
 * - Switch model (e.g., "this exploration task would be faster on haiku")
 * - Retry with a different strategy when stuck
 * - Stop agents that are going in circles
 */
export class ObserverAgent {
  private bus: MessageBus;
  private agentManager: AgentManager;
  private timeline: TimelineTracker;
  private interval: ReturnType<typeof setInterval> | null = null;
  private suggestions = new Map<string, ObserverSuggestion>();
  enabled = false;

  constructor(bus: MessageBus, agentManager: AgentManager, timeline: TimelineTracker) {
    this.bus = bus;
    this.agentManager = agentManager;
    this.timeline = timeline;

    // Listen for suggestion applications
    bus.subscribe((msg) => {
      if (msg.type === "observer:apply") {
        this.applySuggestion(msg.suggestionId);
      }
    });
  }

  start(): void {
    if (this.interval) return;
    this.enabled = true;
    this.interval = setInterval(() => this.observe(), OBSERVER_INTERVAL_MS);
    console.log("[observer] started");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.enabled = false;
  }

  private async observe(): Promise<void> {
    const agents = this.agentManager.getAll();
    if (agents.length === 0) return;

    for (const agent of agents) {
      if (agent.status !== "active") continue;
      if (Date.now() - agent.startTime < MIN_ACTIVE_TIME_MS) continue;

      const timeline = this.timeline.getTimeline(agent.id);
      const suggestion = await this.analyzeAgent(agent, timeline);
      if (suggestion) {
        this.suggestions.set(suggestion.id, suggestion);
        this.bus.publish({
          type: "observer:suggestion",
          suggestion,
          timestamp: Date.now(),
        });
      }
    }
  }

  private async analyzeAgent(
    agent: AgentState,
    timeline: import("@acc/shared").TimelineEvent[]
  ): Promise<ObserverSuggestion | null> {
    const now = Date.now();

    // Don't suggest if we already have an unresolved suggestion for this agent
    for (const s of this.suggestions.values()) {
      if (s.agentId === agent.id && !s.applied) return null;
    }

    // Pattern 1: Stalled agent — no activity in a while
    const sinceActivity = now - agent.lastActivity;
    if (sinceActivity > STALL_THRESHOLD_MS) {
      return this.makeSuggestion(agent.id, {
        title: "Agent appears stalled",
        reasoning: `No activity for ${Math.round(sinceActivity / 1000)}s. The agent may be stuck or waiting.`,
        suggestedAction: {
          action: "retry-different-approach",
          prompt: `You seem to be stuck. Try a completely different approach to: ${agent.currentTask}`,
        },
      });
    }

    // Pattern 2: Lots of Read/Grep without Edit — agent is exploring too long
    const recentToolBatches = timeline.filter((e) => e.kind === "tool-batch").slice(-5);
    const allReadNoWrite = recentToolBatches.length >= 3 &&
      recentToolBatches.every((e) => /Read|Grep|Glob/.test(e.summary) && !/Edit|Write/.test(e.summary));

    if (allReadNoWrite && agent.tokens.input > 50000) {
      return this.makeSuggestion(agent.id, {
        title: "Extensive exploration — consider forking",
        reasoning: "Agent has done 3+ rounds of reading without making changes. A parallel agent with a different approach might be faster.",
        suggestedAction: {
          action: "fork-subagent",
          prompt: `Take a direct approach to: ${agent.currentTask}. Don't over-explore — make changes based on what you find immediately.`,
          model: "sonnet",
        },
      });
    }

    // Pattern 3: Errors piling up
    const recentErrors = timeline.filter((e) => e.kind === "error").slice(-5);
    if (recentErrors.length >= 3) {
      const lastErrorTime = recentErrors[recentErrors.length - 1].timestamp;
      if (now - lastErrorTime < 120_000) {
        return this.makeSuggestion(agent.id, {
          title: "Repeated errors detected",
          reasoning: `${recentErrors.length} errors in recent history. The current approach may be fundamentally wrong.`,
          suggestedAction: {
            action: "retry-different-approach",
            prompt: `Previous approach is hitting repeated errors. Step back, rethink, and try a fundamentally different strategy for: ${agent.currentTask}`,
          },
        });
      }
    }

    // Pattern 4: Using opus for simple tasks (high cost, could be sonnet)
    if (agent.config.model === "opus" && agent.tokens.output > 20000) {
      const hasOnlySimpleTools = agent.recentTools.every((t) =>
        ["Read", "Glob", "Grep", "Bash"].includes(t.tool)
      );
      if (hasOnlySimpleTools) {
        return this.makeSuggestion(agent.id, {
          title: "Consider switching to Sonnet",
          reasoning: "This agent is using Opus but only doing reads and searches. Sonnet would be 5x cheaper for this kind of work.",
          suggestedAction: { action: "switch-model", model: "sonnet" },
        });
      }
    }

    // Pattern 5: Use AI to analyze complex patterns (call claude for deep analysis)
    // Only do this if the agent has been running a while with significant activity
    if (agent.tokens.input > 100000 && timeline.length > 15) {
      return this.aiAnalysis(agent, timeline);
    }

    return null;
  }

  private async aiAnalysis(
    agent: AgentState,
    timeline: import("@acc/shared").TimelineEvent[]
  ): Promise<ObserverSuggestion | null> {
    const timelineSummary = timeline.slice(-20).map((e) =>
      `[${e.kind}] ${e.summary}`
    ).join("\n");

    const prompt = `You are an observer agent analyzing another AI agent's work. Be brief.

Agent: "${agent.name}" (${agent.config.model ?? "sonnet"})
Task: "${agent.currentTask}"
Tokens used: ${agent.tokens.input} in, ${agent.tokens.output} out ($${agent.cost.toFixed(2)})
Uptime: ${Math.round((Date.now() - agent.startTime) / 1000)}s

Timeline (recent):
${timelineSummary}

Is this agent making good progress, or would you suggest an intervention?
If suggesting, respond in JSON (no markdown):
{"suggest": true, "title": "short title", "reasoning": "why", "action": "fork-subagent|switch-model|retry-different-approach|stop-agent", "prompt": "if fork/retry, what prompt to use", "model": "if switch/fork, which model"}

If no suggestion needed:
{"suggest": false}`;

    try {
      const env = { ...process.env };
      delete env.CLAUDECODE;

      const proc = Bun.spawn(
        ["claude", "-p", prompt, "--output-format", "json", "--model", "haiku"],
        { stdout: "pipe", stderr: "pipe", env }
      );
      const output = await new Response(proc.stdout).text();
      await proc.exited;

      let result: any;
      try {
        const parsed = JSON.parse(output);
        result = JSON.parse(parsed.result ?? output);
      } catch {
        try {
          result = JSON.parse(output);
        } catch {
          return null;
        }
      }

      if (!result.suggest) return null;

      let suggestedAction: SuggestionAction;
      switch (result.action) {
        case "fork-subagent":
          suggestedAction = { action: "fork-subagent", prompt: result.prompt ?? "", model: result.model };
          break;
        case "switch-model":
          suggestedAction = { action: "switch-model", model: result.model ?? "sonnet" };
          break;
        case "retry-different-approach":
          suggestedAction = { action: "retry-different-approach", prompt: result.prompt ?? "" };
          break;
        case "stop-agent":
          suggestedAction = { action: "stop-agent" };
          break;
        default:
          suggestedAction = { action: "custom", label: result.title, prompt: result.prompt ?? "" };
      }

      return this.makeSuggestion(agent.id, {
        title: result.title,
        reasoning: result.reasoning,
        suggestedAction,
      });
    } catch {
      return null;
    }
  }

  private makeSuggestion(
    agentId: string,
    data: { title: string; reasoning: string; suggestedAction: SuggestionAction }
  ): ObserverSuggestion {
    return {
      id: crypto.randomUUID(),
      agentId,
      title: data.title,
      reasoning: data.reasoning,
      suggestedAction: data.suggestedAction,
      createdAt: Date.now(),
      applied: false,
    };
  }

  private async applySuggestion(suggestionId: string): Promise<void> {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion || suggestion.applied) return;

    suggestion.applied = true;
    const { agentId, suggestedAction } = suggestion;

    switch (suggestedAction.action) {
      case "fork-subagent": {
        const agent = this.agentManager.get(agentId);
        if (!agent) break;
        this.bus.publish({
          type: "user:spawn",
          config: {
            prompt: suggestedAction.prompt,
            workDir: agent.config.workDir,
            name: `${agent.name} (fork)`,
            model: (suggestedAction.model as any) ?? agent.config.model,
          },
          timestamp: Date.now(),
        });
        break;
      }

      case "switch-model": {
        // Stop current agent, respawn with new model
        this.bus.publish({
          type: "agent:prompt",
          agentId,
          prompt: `Continue your current task. You are now running on ${suggestedAction.model}.`,
          from: "observer",
          timestamp: Date.now(),
        });
        break;
      }

      case "retry-different-approach": {
        this.bus.publish({
          type: "agent:prompt",
          agentId,
          prompt: suggestedAction.prompt,
          from: "observer",
          timestamp: Date.now(),
        });
        break;
      }

      case "stop-agent": {
        this.bus.publish({
          type: "agent:stop",
          agentId,
          from: "observer",
          timestamp: Date.now(),
        });
        break;
      }

      case "custom": {
        this.bus.publish({
          type: "agent:prompt",
          agentId,
          prompt: suggestedAction.prompt,
          from: "observer",
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  getSuggestions(): ObserverSuggestion[] {
    return Array.from(this.suggestions.values()).filter((s) => !s.applied);
  }
}
