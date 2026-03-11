import type { ServerWebSocket } from "bun";
import type { BusMessage } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { AgentManager } from "./agent-manager.js";

export class WsBridge {
  private clients = new Set<ServerWebSocket<unknown>>();
  private bus: MessageBus;
  private manager: AgentManager;

  constructor(bus: MessageBus, manager: AgentManager) {
    this.bus = bus;
    this.manager = manager;

    // Forward bus messages to all connected WebSocket clients
    bus.subscribe((msg) => {
      const json = JSON.stringify(msg);
      for (const ws of this.clients) {
        try {
          ws.send(json);
        } catch {
          this.clients.delete(ws);
        }
      }
    });
  }

  onOpen(ws: ServerWebSocket<unknown>): void {
    this.clients.add(ws);

    // Send initial snapshot
    const snapshot = {
      type: "snapshot" as const,
      agents: this.manager.getAll(),
      stats: this.manager.getStats(),
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(snapshot));
  }

  onClose(ws: ServerWebSocket<unknown>): void {
    this.clients.delete(ws);
  }

  onMessage(ws: ServerWebSocket<unknown>, message: string | Buffer): void {
    try {
      const data = JSON.parse(typeof message === "string" ? message : message.toString());

      // Validate and publish to bus — dashboard is just another bus node
      if (data.type && typeof data.type === "string") {
        const msg: BusMessage = {
          ...data,
          timestamp: Date.now(),
        };
        this.bus.publish(msg);
      }
    } catch (err) {
      console.error("[ws-bridge] message parse error:", err);
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
