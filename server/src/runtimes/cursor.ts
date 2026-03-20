import type { RuntimeDriver } from "./index.js";
import type { SpawnConfig, BusMessage } from "@acc/shared";

export const cursorDriver: RuntimeDriver = {
  binaryName: "cursor-agent",
  isMultiTurn: false,

  buildArgs(config: SpawnConfig): string[] {
    return ["--yolo", config.prompt];
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
