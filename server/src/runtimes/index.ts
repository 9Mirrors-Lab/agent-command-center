import type { SpawnConfig, BusMessage } from "@acc/shared";
import { claudeDriver } from "./claude.js";
import { codexDriver } from "./codex.js";
import { cursorDriver } from "./cursor.js";
import { opencodeDriver } from "./opencode.js";

export interface RuntimeDriver {
  binaryName: string;
  buildArgs(config: SpawnConfig, sessionId: string, resumeSessionId?: string): string[];
  parseLine(line: string, agentId: string): BusMessage[];
  isMultiTurn: boolean;
  buildEnv(env: Record<string, string | undefined>): Record<string, string | undefined>;
}

const registry: Record<string, RuntimeDriver> = {
  claude: claudeDriver,
  codex: codexDriver,
  cursor: cursorDriver,
  opencode: opencodeDriver,
};

export function getRuntime(name: string): RuntimeDriver {
  return registry[name] ?? registry.claude;
}
