import type { TimelineEvent, TimelineEventKind, BusMessage } from "@acc/shared";
import { MessageBus } from "./bus.js";

const MAX_TIMELINE_EVENTS = 100;

/**
 * Timeline Tracker — maintains a structured breadcrumb trail for each agent.
 * Instead of raw output, this gives the user a cognitive map:
 * "started with X → explored Y → tried Z → hit error → currently doing W"
 *
 * Collapses repetitive tool use into batches, detects phase changes,
 * and highlights decisions/errors.
 */
export class TimelineTracker {
  private bus: MessageBus;
  private timelines = new Map<string, TimelineEvent[]>();
  // Track consecutive tool uses to batch them
  private toolBatch = new Map<string, { tools: string[]; startTime: number }>();
  // Track last text to detect phase changes
  private lastSignificantText = new Map<string, string>();

  constructor(bus: MessageBus) {
    this.bus = bus;
    bus.subscribe((msg) => this.handleMessage(msg));
  }

  private handleMessage(msg: BusMessage): void {
    switch (msg.type) {
      case "agent:spawned":
        this.addEvent(msg.agentId, {
          kind: "task-start",
          summary: `Started: "${msg.config.prompt.slice(0, 80)}"`,
          detail: msg.config.prompt,
          timestamp: msg.timestamp,
        });
        break;

      case "agent:text":
        if (!msg.partial) {
          this.handleText(msg.agentId, msg.content, msg.timestamp);
        }
        break;

      case "agent:tool_use":
        this.handleToolUse(msg.agentId, msg.tool, msg.target, msg.timestamp);
        break;

      case "agent:tool_result":
        if (!msg.success) {
          this.flushToolBatch(msg.agentId);
          this.addEvent(msg.agentId, {
            kind: "error",
            summary: `Tool failed: ${msg.tool}`,
            timestamp: msg.timestamp,
          });
        }
        break;

      case "agent:status":
        if (msg.status === "idle") {
          this.flushToolBatch(msg.agentId);
          this.addEvent(msg.agentId, {
            kind: "idle",
            summary: "Task completed — agent idle",
            timestamp: msg.timestamp,
          });
        } else if (msg.status === "errored") {
          this.flushToolBatch(msg.agentId);
          this.addEvent(msg.agentId, {
            kind: "error",
            summary: "Agent errored",
            timestamp: msg.timestamp,
          });
        }
        break;

      case "approval:requested":
        this.flushToolBatch(msg.agentId);
        this.addEvent(msg.agentId, {
          kind: "approval-requested",
          summary: `Waiting: ${msg.approval.title}`,
          detail: msg.approval.detail,
          timestamp: msg.timestamp,
        });
        break;

      case "approval:resolved":
        this.addEvent(msg.agentId, {
          kind: "approval-resolved",
          summary: msg.accepted ? "Approved — continuing" : "Rejected",
          timestamp: msg.timestamp,
        });
        break;
    }
  }

  private handleText(agentId: string, content: string, timestamp: number): void {
    // Detect significant text that indicates a phase change
    const phaseIndicators = [
      /^(?:Phase|Step|Stage) \d/i,
      /^(?:Now|Next|Moving on)/i,
      /(?:plan|approach|strategy):/i,
      /^(?:##|###) /,  // Markdown headers
      /(?:Let me|I'll|I will) (?:now |start |begin )/i,
    ];

    const isPhaseChange = phaseIndicators.some((p) => p.test(content));
    if (isPhaseChange) {
      this.flushToolBatch(agentId);
      const summary = content.split("\n")[0].slice(0, 120);
      this.addEvent(agentId, {
        kind: "phase-change",
        summary,
        detail: content.slice(0, 500),
        timestamp,
      });
      this.lastSignificantText.set(agentId, content);
      return;
    }

    // Detect decision points
    const decisionIndicators = [
      /(?:I(?:'ll| will) (?:use|go with|choose|pick))/i,
      /(?:decided|choosing|opting) (?:to|for)/i,
      /(?:instead of|rather than|better approach)/i,
      /(?:the (?:best|right|correct) (?:way|approach))/i,
    ];

    if (decisionIndicators.some((p) => p.test(content))) {
      const summary = content.split("\n")[0].slice(0, 120);
      this.addEvent(agentId, {
        kind: "decision",
        summary,
        detail: content.slice(0, 500),
        timestamp,
      });
    }
  }

  private handleToolUse(agentId: string, tool: string, target: string | undefined, timestamp: number): void {
    const batch = this.toolBatch.get(agentId);
    const label = target ? `${tool}: ${target}` : tool;

    if (batch) {
      batch.tools.push(label);
      // Flush if batch gets large
      if (batch.tools.length >= 8) {
        this.flushToolBatch(agentId);
      }
    } else {
      this.toolBatch.set(agentId, { tools: [label], startTime: timestamp });
    }
  }

  private flushToolBatch(agentId: string): void {
    const batch = this.toolBatch.get(agentId);
    if (!batch || batch.tools.length === 0) return;

    this.toolBatch.delete(agentId);

    // Collapse similar tools
    const toolCounts = new Map<string, number>();
    for (const t of batch.tools) {
      const base = t.split(":")[0];
      toolCounts.set(base, (toolCounts.get(base) ?? 0) + 1);
    }

    const parts = Array.from(toolCounts.entries()).map(([tool, count]) =>
      count > 1 ? `${tool} x${count}` : tool
    );

    this.addEvent(agentId, {
      kind: "tool-batch",
      summary: parts.join(", "),
      detail: batch.tools.join("\n"),
      timestamp: batch.startTime,
    });
  }

  private addEvent(agentId: string, event: TimelineEvent): void {
    const timeline = this.timelines.get(agentId) ?? [];
    timeline.push(event);
    if (timeline.length > MAX_TIMELINE_EVENTS) {
      timeline.splice(0, timeline.length - MAX_TIMELINE_EVENTS);
    }
    this.timelines.set(agentId, timeline);

    // Publish to bus so dashboard gets it in real-time
    this.bus.publish({
      type: "agent:timeline",
      agentId,
      event,
      timestamp: event.timestamp,
    });
  }

  getTimeline(agentId: string): TimelineEvent[] {
    return this.timelines.get(agentId) ?? [];
  }
}
