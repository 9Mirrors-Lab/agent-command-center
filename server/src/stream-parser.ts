import type { BusMessage } from "@acc/shared";

/**
 * Parse a single NDJSON line from `claude -p --output-format stream-json`.
 * Returns bus messages extracted from this line, or empty array if unparseable.
 *
 * Claude's stream-json format emits lines like:
 * - {"type":"system", ...}
 * - {"type":"assistant", "message":{"content":[{type:"text"|"tool_use"|"tool_result",...}]}}
 * - {"type":"result", "result":"...", "session_id":"...", "usage":{input_tokens, output_tokens}}
 */
export function parseStreamLine(line: string, agentId: string): BusMessage[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const now = Date.now();
  const messages: BusMessage[] = [];

  // Result event — contains token usage and signals task completion
  if (parsed.type === "result") {
    if (parsed.usage) {
      messages.push({
        type: "agent:tokens",
        agentId,
        input: parsed.usage.input_tokens ?? 0,
        output: parsed.usage.output_tokens ?? 0,
        timestamp: now,
      });
    }
    if (parsed.result) {
      messages.push({
        type: "agent:text",
        agentId,
        content: typeof parsed.result === "string" ? parsed.result : JSON.stringify(parsed.result),
        partial: false,
        timestamp: now,
      });
    }
    // Signal task completion
    messages.push({
      type: "agent:status",
      agentId,
      status: "idle",
      timestamp: now,
    });
    return messages;
  }

  // Assistant message — contains text and tool_use blocks
  const content = parsed.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && block.text) {
        messages.push({
          type: "agent:text",
          agentId,
          content: block.text,
          partial: !!parsed.stop_reason,
          timestamp: now,
        });
      }

      if (block.type === "tool_use" && block.name) {
        const target = extractTarget(block.name, block.input);
        messages.push({
          type: "agent:tool_use",
          agentId,
          toolId: block.id ?? "",
          tool: block.name,
          target,
          timestamp: now,
        });
      }

      if (block.type === "tool_result" && block.tool_use_id) {
        messages.push({
          type: "agent:tool_result",
          agentId,
          toolId: block.tool_use_id,
          tool: "",
          success: !block.is_error,
          timestamp: now,
        });
      }
    }
  }

  return messages;
}

function extractTarget(toolName: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  switch (toolName) {
    case "Read":
    case "Write":
    case "Edit":
      return (input.file_path as string) ?? (input.path as string);
    case "Glob":
    case "Grep":
      return input.pattern as string;
    case "Bash": {
      const cmd = input.command as string;
      return cmd ? cmd.slice(0, 50) + (cmd.length > 50 ? "..." : "") : undefined;
    }
    default:
      return undefined;
  }
}
