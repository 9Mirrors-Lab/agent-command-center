// ── Agent Status ──
export type AgentStatus = "active" | "idle" | "stopped" | "errored";

// ── Spawn Config ──
export interface SpawnConfig {
  prompt: string;
  workDir: string;
  name?: string;
  model?: "opus" | "sonnet" | "haiku";
  budget?: number;
  allowedTools?: string[];
}

// ── Agent State ──
export interface AgentState {
  id: string;
  name: string;
  status: AgentStatus;
  config: SpawnConfig;
  sessionId: string;
  pid?: number;
  tokens: { input: number; output: number };
  cost: number;
  startTime: number;
  lastActivity: number;
  currentTask?: string;
  recentTools: ToolActivity[];
  outputLines: string[];
}

export interface ToolActivity {
  tool: string;
  target?: string;
  status: "running" | "completed" | "error";
  startTime: number;
  endTime?: number;
}

// ── Manager Agent ──
export interface AgentSummary {
  agentId: string;
  assessment: "on-track" | "stalled" | "needs-attention" | "done" | "errored";
  note: string;
}

export type ManagerMode = "observe" | "semi-auto" | "auto";

// ── Bus Messages ──
export type BusMessage =
  // Agent lifecycle
  | { type: "agent:spawned"; agentId: string; config: SpawnConfig; timestamp: number }
  | { type: "agent:stopped"; agentId: string; reason: string; timestamp: number }
  | { type: "agent:status"; agentId: string; status: AgentStatus; timestamp: number }
  // Agent output
  | { type: "agent:text"; agentId: string; content: string; partial: boolean; timestamp: number }
  | { type: "agent:tool_use"; agentId: string; toolId: string; tool: string; target?: string; timestamp: number }
  | { type: "agent:tool_result"; agentId: string; toolId: string; tool: string; success: boolean; timestamp: number }
  | { type: "agent:tokens"; agentId: string; input: number; output: number; timestamp: number }
  // Bidirectional control
  | { type: "agent:prompt"; agentId: string; prompt: string; from: string; timestamp: number }
  | { type: "agent:stop"; agentId: string; from: string; timestamp: number }
  | { type: "agent:resume"; agentId: string; from: string; timestamp: number }
  // Manager
  | { type: "manager:summary"; summary: string; agentStates: AgentSummary[]; timestamp: number }
  | { type: "manager:alert"; agentId: string; alert: string; severity: "info" | "warn" | "error"; timestamp: number }
  | { type: "manager:suggestion"; agentId: string; suggestion: string; timestamp: number }
  // User actions
  | { type: "user:spawn"; config: SpawnConfig; timestamp: number }
  | { type: "user:message"; agentId: string; message: string; timestamp: number }
  | { type: "user:broadcast"; message: string; timestamp: number };
