import type { RuntimeDriver } from "./index.js";
import type { SpawnConfig, BusMessage } from "@acc/shared";
import { parseStreamLine } from "../stream-parser.js";

/** Map ACC / Claude-style model ids to cursor-agent --model values when set on config. */
const CURSOR_MODEL_ALIASES: Record<string, string> = {
  sonnet: "sonnet-4",
  opus: "claude-opus-4-6",
  haiku: "haiku-4.5",
};

export const cursorDriver: RuntimeDriver = {
  binaryName: "cursor-agent",
  isMultiTurn: false,

  buildArgs(config: SpawnConfig, _sessionId: string, resumeSessionId?: string): string[] {
    const args: string[] = [
      "-p",
      "--output-format",
      "stream-json",
      "--stream-partial-output",
      "--yolo",
    ];

    if (resumeSessionId) {
      args.push("--resume", resumeSessionId);
    }

    const rawModel = config.model?.trim();
    if (rawModel) {
      const mapped = CURSOR_MODEL_ALIASES[rawModel] ?? rawModel;
      args.push("--model", mapped);
    }

    args.push(config.prompt);
    return args;
  },

  parseLine(line: string, agentId: string): BusMessage[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    // stream-json lines (same family as Claude Code print mode)
    const fromStream = parseStreamLine(line, agentId);
    if (fromStream.length > 0) return fromStream;

    // Plain-text errors (e.g. auth) when not using stream-json
    if (trimmed.startsWith("Error:")) {
      return [{
        type: "agent:text",
        agentId,
        content: trimmed,
        partial: false,
        timestamp: Date.now(),
      }, {
        type: "agent:status",
        agentId,
        status: "errored",
        timestamp: Date.now(),
      }];
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
    const next = { ...env };
    // Ensure CLI can find ~/.cursor auth state when the server is started from a minimal env.
    if (!next.HOME && process.env.HOME) {
      next.HOME = process.env.HOME;
    }
    return next;
  },
};
