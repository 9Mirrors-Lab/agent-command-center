import type { RuntimeDriver } from "./index.js";
import type { SpawnConfig, BusMessage } from "@acc/shared";

export const codexDriver: RuntimeDriver = {
  binaryName: "codex",
  isMultiTurn: false,

  buildArgs(config: SpawnConfig): string[] {
    return ["--approval-mode", "full-auto", "-q", config.prompt];
  },

  parseLine(line: string, agentId: string): BusMessage[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    // Try to parse as JSON (Codex may emit structured output)
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.type === "message" && parsed.content) {
        return [{
          type: "agent:text",
          agentId,
          content: typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content),
          partial: true,
          timestamp: Date.now(),
        }];
      }
    } catch {
      // Not JSON — treat as plain text
    }

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
