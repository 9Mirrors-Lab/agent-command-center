import type { ActivityEntry, BusMessage } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { AgentManager } from "./agent-manager.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const MAX_ENTRIES = 1000;
const DATA_DIR = join(process.env.HOME || "/tmp", ".agent-command-center");
const LOG_FILE = join(DATA_DIR, "activity-log.json");

export class ActivityLog {
  private entries: ActivityEntry[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(
    private bus: MessageBus,
    private manager: AgentManager,
  ) {
    this.load();
    this.subscribe();
  }

  private subscribe(): void {
    this.unsubscribe = this.bus.subscribe((msg) => {
      const entry = this.toEntry(msg);
      if (entry) {
        this.entries.push(entry);
        if (this.entries.length > MAX_ENTRIES) {
          this.entries = this.entries.slice(-MAX_ENTRIES);
        }
        this.persist();
      }
    });
  }

  private resolveAgentName(agentId: string): string {
    const agent = this.manager.get(agentId);
    return agent?.name ?? `Agent ${agentId.slice(0, 6)}`;
  }

  private toEntry(msg: BusMessage): ActivityEntry | null {
    switch (msg.type) {
      case "agent:spawned":
        return {
          id: randomUUID(),
          agentId: msg.agentId,
          agentName: msg.config.name ?? `Agent ${msg.agentId.slice(0, 6)}`,
          kind: "spawn",
          summary: `Spawned (${msg.config.runtime ?? "claude"}, ${msg.config.model ?? "sonnet"})`,
          detail: msg.config.prompt.slice(0, 200),
          timestamp: msg.timestamp,
        };

      case "agent:stopped":
        return {
          id: randomUUID(),
          agentId: msg.agentId,
          agentName: this.resolveAgentName(msg.agentId),
          kind: "stop",
          summary: `Stopped: ${msg.reason}`,
          timestamp: msg.timestamp,
        };

      case "agent:timeline":
        return {
          id: randomUUID(),
          agentId: msg.agentId,
          agentName: this.resolveAgentName(msg.agentId),
          kind: this.timelineKindToActivityKind(msg.event.kind),
          summary: msg.event.summary,
          detail: msg.event.detail,
          timestamp: msg.timestamp,
        };

      case "agent:delegate":
        return {
          id: randomUUID(),
          agentId: msg.agentId,
          agentName: this.resolveAgentName(msg.agentId),
          kind: "delegation",
          summary: `Delegated: ${msg.task.slice(0, 120)}`,
          detail: msg.task,
          timestamp: msg.timestamp,
        };

      case "agent:worker-result":
        return {
          id: randomUUID(),
          agentId: msg.agentId,
          agentName: this.resolveAgentName(msg.agentId),
          kind: "delegation",
          summary: `Worker completed → ${msg.parentId.slice(0, 6)}`,
          detail: msg.summary.slice(0, 200),
          timestamp: msg.timestamp,
        };

      case "learning:added":
        return {
          id: randomUUID(),
          agentId: msg.learning.agentId,
          agentName: this.resolveAgentName(msg.learning.agentId),
          kind: "learning",
          summary: `Learning: ${msg.learning.title}`,
          detail: msg.learning.detail,
          timestamp: msg.timestamp,
        };

      case "approval:requested":
        return {
          id: randomUUID(),
          agentId: msg.agentId,
          agentName: this.resolveAgentName(msg.agentId),
          kind: "approval",
          summary: `Approval needed: ${msg.approval.title}`,
          detail: msg.approval.detail,
          timestamp: msg.timestamp,
        };

      default:
        return null;
    }
  }

  private timelineKindToActivityKind(kind: string): ActivityEntry["kind"] {
    switch (kind) {
      case "tool-batch": return "tool";
      case "decision": return "decision";
      case "phase-change": return "phase";
      case "error": return "error";
      case "approval-requested":
      case "approval-resolved": return "approval";
      default: return "phase";
    }
  }

  getEntries(since?: number, limit?: number): ActivityEntry[] {
    let result = this.entries;
    if (since) {
      result = result.filter((e) => e.timestamp > since);
    }
    if (limit) {
      result = result.slice(-limit);
    }
    return result;
  }

  private load(): void {
    try {
      if (existsSync(LOG_FILE)) {
        const data = JSON.parse(readFileSync(LOG_FILE, "utf-8"));
        if (Array.isArray(data)) {
          this.entries = data.slice(-MAX_ENTRIES);
        }
      }
    } catch {
      this.entries = [];
    }
  }

  private persist(): void {
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }
      writeFileSync(LOG_FILE, JSON.stringify(this.entries.slice(-MAX_ENTRIES)));
    } catch (err) {
      console.error("[activity-log] persist error:", err);
    }
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
