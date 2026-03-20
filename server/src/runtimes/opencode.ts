import type { RuntimeDriver } from "./index.js";
import type { SpawnConfig, BusMessage } from "@acc/shared";

export const opencodeDriver: RuntimeDriver = {
  binaryName: "opencode",
  isMultiTurn: false,

  buildArgs(config: SpawnConfig): string[] {
    return ["run", config.prompt];
  },

  parseLine(line: string, agentId: string): BusMessage[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    return [{
      type: "agent:text",
      agentId,
      content: trimmed,
      partial: true,
      timestamp: Date.now(),
    }];
  },

  buildEnv(env: Record<string, string | undefined>) {
    return { ...env };
  },
};
