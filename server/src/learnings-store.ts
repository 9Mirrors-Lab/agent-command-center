import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { Learning, LearningSource, LearningCategory, BusMessage } from "@acc/shared";
import { MessageBus } from "./bus.js";

const CONFIG_DIR = join(homedir(), ".agent-command-center");
const LEARNINGS_PATH = join(CONFIG_DIR, "learnings.json");
const MAX_LEARNINGS = 200;

export class LearningsStore {
  private learnings: Learning[] = [];
  private bus: MessageBus;

  constructor(bus: MessageBus) {
    this.bus = bus;
    this.load();

    // Subscribe to bus for auto-learning from observer suggestions
    bus.subscribe((msg) => this.handleBusMessage(msg));
  }

  private handleBusMessage(msg: BusMessage): void {
    // When an observer suggestion is applied, track it as a potential learning
    if (msg.type === "observer:apply") {
      // Find the suggestion that was applied (we don't have it directly,
      // but we can create a learning noting the pattern)
      this.add({
        agentId: "",
        source: "observer",
        category: "optimization",
        title: `Observer suggestion applied`,
        detail: `Suggestion ${msg.suggestionId} was accepted by the user.`,
        confidence: 0.5,
      });
    }
  }

  private load(): void {
    try {
      if (existsSync(LEARNINGS_PATH)) {
        const data = readFileSync(LEARNINGS_PATH, "utf-8");
        this.learnings = JSON.parse(data);
      }
    } catch (err) {
      console.error("[LearningsStore] Failed to load:", err);
      this.learnings = [];
    }
  }

  private save(): void {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(LEARNINGS_PATH, JSON.stringify(this.learnings, null, 2), "utf-8");
    } catch (err) {
      console.error("[LearningsStore] Failed to save:", err);
    }
  }

  add(params: {
    agentId: string;
    source: LearningSource;
    category: LearningCategory;
    title: string;
    detail: string;
    confidence: number;
  }): Learning {
    const learning: Learning = {
      id: crypto.randomUUID(),
      agentId: params.agentId,
      source: params.source,
      category: params.category,
      title: params.title,
      detail: params.detail,
      confidence: Math.max(0, Math.min(1, params.confidence)),
      createdAt: Date.now(),
      appliedCount: 0,
    };

    this.learnings.push(learning);

    // Prune oldest if over limit
    if (this.learnings.length > MAX_LEARNINGS) {
      this.learnings = this.learnings.slice(-MAX_LEARNINGS);
    }

    this.save();

    this.bus.publish({
      type: "learning:added",
      learning,
      timestamp: Date.now(),
    });

    return learning;
  }

  update(id: string, updates: { confidence?: number; appliedCount?: number }): Learning | null {
    const learning = this.learnings.find((l) => l.id === id);
    if (!learning) return null;

    if (updates.confidence !== undefined) learning.confidence = updates.confidence;
    if (updates.appliedCount !== undefined) learning.appliedCount = updates.appliedCount;

    this.save();

    this.bus.publish({
      type: "learning:updated",
      learningId: id,
      confidence: learning.confidence,
      appliedCount: learning.appliedCount,
      timestamp: Date.now(),
    });

    return learning;
  }

  remove(id: string): boolean {
    const idx = this.learnings.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    this.learnings.splice(idx, 1);
    this.save();
    return true;
  }

  getAll(): Learning[] {
    return [...this.learnings];
  }
}
