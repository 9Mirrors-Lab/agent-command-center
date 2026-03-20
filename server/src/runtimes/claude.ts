import type { RuntimeDriver } from "./index.js";
import type { SpawnConfig } from "@acc/shared";
import { DEFAULT_ALLOWED_TOOLS } from "@acc/shared";
import { parseStreamLine } from "../stream-parser.js";

export const claudeDriver: RuntimeDriver = {
  binaryName: "claude",
  isMultiTurn: true,

  buildArgs(config: SpawnConfig, sessionId: string, resumeSessionId?: string): string[] {
    let prompt = config.prompt;

    // Inject coordinator preamble
    if (config.role === "coordinator") {
      prompt = COORDINATOR_PREAMBLE + "\n\n" + prompt;
    } else if (config.role === "worker") {
      prompt = WORKER_PREAMBLE + "\n\n" + prompt;
    }

    const args: string[] = ["-p", prompt];
    args.push("--output-format", "stream-json");
    args.push("--verbose");
    args.push("--session-id", resumeSessionId ?? sessionId);

    if (resumeSessionId) {
      args.push("--resume", resumeSessionId);
    }

    if (config.budget) {
      args.push("--max-budget-usd", String(config.budget));
    }

    if (config.model) {
      args.push("--model", config.model);
    }

    const tools = config.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
    for (const tool of tools) {
      args.push("--allowedTools", tool);
    }

    return args;
  },

  parseLine(line: string, agentId: string) {
    return parseStreamLine(line, agentId);
  },

  buildEnv(env: Record<string, string | undefined>) {
    const cleaned = { ...env };
    delete cleaned.CLAUDECODE;
    return cleaned;
  },
};

const COORDINATOR_PREAMBLE = `You are a coordinator agent. When you need to delegate a focused task to a sub-agent, emit a delegation block in this exact format:

<delegate>
task: Description of what the sub-agent should do
model: sonnet
</delegate>

The sub-agent will be spawned automatically and will report results back to you. You can delegate multiple tasks. Continue working on other aspects while waiting for workers to complete. Only delegate tasks that are independent and focused — keep the high-level orchestration yourself.`;

const WORKER_PREAMBLE = `You are a focused worker agent. Complete the assigned task efficiently and output a clear, concise summary of what you did and any important results. Do not ask for clarification — make reasonable decisions and proceed.`;
