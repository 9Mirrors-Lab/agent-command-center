import type { BusMessage } from "@acc/shared";
import { RING_BUFFER_SIZE } from "@acc/shared";

type Listener = (msg: BusMessage) => void;

export class MessageBus {
  private listeners = new Set<Listener>();
  private buffer: BusMessage[] = [];

  publish(msg: BusMessage): void {
    this.buffer.push(msg);
    if (this.buffer.length > RING_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-RING_BUFFER_SIZE);
    }
    for (const listener of this.listeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error("[bus] listener error:", err);
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRecent(count?: number): BusMessage[] {
    const n = count ?? RING_BUFFER_SIZE;
    return this.buffer.slice(-n);
  }
}
