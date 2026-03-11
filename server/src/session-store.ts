import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SpawnConfig } from "@acc/shared";

const STORE_DIR = join(homedir(), ".agent-command-center");
const STORE_FILE = join(STORE_DIR, "agents.json");

export interface StoredAgent {
  id: string;
  sessionId: string;
  name: string;
  config: SpawnConfig;
  tokens: { input: number; output: number };
  cost: number;
  startTime: number;
  stoppedAt?: number;
}

interface StoreData {
  version: 1;
  agents: StoredAgent[];
}

export function loadStore(): StoredAgent[] {
  try {
    if (!existsSync(STORE_FILE)) return [];
    const raw = readFileSync(STORE_FILE, "utf-8");
    const data: StoreData = JSON.parse(raw);
    return data.agents ?? [];
  } catch {
    return [];
  }
}

export function saveStore(agents: StoredAgent[]): void {
  try {
    if (!existsSync(STORE_DIR)) {
      mkdirSync(STORE_DIR, { recursive: true });
    }
    const data: StoreData = { version: 1, agents };
    writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[store] save error:", err);
  }
}

export function addToStore(agent: StoredAgent): void {
  const agents = loadStore();
  const idx = agents.findIndex((a) => a.id === agent.id);
  if (idx >= 0) {
    agents[idx] = agent;
  } else {
    agents.push(agent);
  }
  // Keep last 50 agents
  saveStore(agents.slice(-50));
}

export function removeFromStore(agentId: string): void {
  const agents = loadStore().filter((a) => a.id !== agentId);
  saveStore(agents);
}
