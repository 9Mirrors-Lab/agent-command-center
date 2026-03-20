import type { BusMessage, RuntimeType } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { AgentManager } from "./agent-manager.js";

/**
 * Watches agent output for <delegate> blocks from coordinator agents.
 * When detected, publishes agent:delegate messages to the bus,
 * which the AgentManager handles by spawning worker agents.
 */
export class DelegationDetector {
  private textBuffers = new Map<string, string>();

  constructor(
    private bus: MessageBus,
    private manager: AgentManager,
  ) {
    bus.subscribe((msg) => this.handleMessage(msg));
  }

  private handleMessage(msg: BusMessage): void {
    if (msg.type !== "agent:text") return;

    const agentState = this.manager.get(msg.agentId);
    if (!agentState || agentState.role !== "coordinator") return;

    // Buffer text to handle blocks that span multiple messages
    const existing = this.textBuffers.get(msg.agentId) ?? "";
    const combined = existing + msg.content;

    // Extract complete <delegate> blocks
    const { blocks, remainder } = this.extractBlocks(combined);

    if (remainder) {
      this.textBuffers.set(msg.agentId, remainder);
    } else {
      this.textBuffers.delete(msg.agentId);
    }

    for (const block of blocks) {
      const parsed = this.parseBlock(block);
      if (parsed) {
        this.bus.publish({
          type: "agent:delegate",
          agentId: msg.agentId,
          task: parsed.task,
          model: parsed.model,
          runtime: parsed.runtime,
          timestamp: Date.now(),
        });
      }
    }
  }

  private extractBlocks(text: string): { blocks: string[]; remainder: string } {
    const blocks: string[] = [];
    const regex = /<delegate>([\s\S]*?)<\/delegate>/gi;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      blocks.push(match[1].trim());
      lastIndex = regex.lastIndex;
    }

    // Check for incomplete opening tag at the end
    const remainder = text.includes("<delegate>") && !text.includes("</delegate>")
      ? text.slice(text.lastIndexOf("<delegate>"))
      : "";

    return { blocks, remainder };
  }

  private parseBlock(block: string): { task: string; model?: string; runtime?: RuntimeType } | null {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let task = "";
    let model: string | undefined;
    let runtime: RuntimeType | undefined;

    for (const line of lines) {
      const taskMatch = line.match(/^task:\s*(.+)/i);
      if (taskMatch) { task = taskMatch[1]; continue; }

      const modelMatch = line.match(/^model:\s*(.+)/i);
      if (modelMatch) { model = modelMatch[1].trim(); continue; }

      const runtimeMatch = line.match(/^runtime:\s*(.+)/i);
      if (runtimeMatch) { runtime = runtimeMatch[1].trim() as RuntimeType; continue; }

      // If no key prefix, treat as continuation of task
      if (!task) task = line;
      else task += " " + line;
    }

    if (!task) return null;
    return { task, model, runtime };
  }
}
