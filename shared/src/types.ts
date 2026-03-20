// ── Runtime Types ──
export type RuntimeType = "claude" | "codex" | "cursor" | "opencode";

// ── Agent Status ──
export type AgentStatus = "active" | "idle" | "stopped" | "errored";

// ── Agent Roles ──
export type AgentRole = "standalone" | "coordinator" | "worker";

export interface WorkerAssignment {
  parentId: string;
  taskDescription: string;
  assignedAt: number;
  completedAt?: number;
  result?: string;
}

// ── Spawn Config ──
export interface SpawnConfig {
  prompt: string;
  workDir: string;
  name?: string;
  model?: "opus" | "sonnet" | "haiku";
  budget?: number;
  allowedTools?: string[];
  runtime?: RuntimeType;
  role?: AgentRole;
  workerAssignment?: WorkerAssignment;
  machine?: string;
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
  timeline: TimelineEvent[];
  pendingApprovals: PendingApproval[];
  runtime: RuntimeType;
  role: AgentRole;
  workerAssignment?: WorkerAssignment;
  childAgentIds: string[];
}

// ── Machine Config ──
export interface MachineConfig {
  name: string;
  host?: string;
  user?: string;
  sshKey?: string;
  tmuxSession?: string;
}

// ── View Mode ──
export type ViewMode = "grid" | "pipeline" | "focus";

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

// ── Approval Gates ──
export type ApprovalType = "plan" | "continue" | "permission" | "confirm";

export interface PendingApproval {
  id: string;
  agentId: string;
  type: ApprovalType;
  title: string;
  detail: string;
  createdAt: number;
  resolved: boolean;
}

// ── Context Timeline ──
export type TimelineEventKind =
  | "task-start"
  | "phase-change"
  | "tool-batch"
  | "decision"
  | "error"
  | "approval-requested"
  | "approval-resolved"
  | "idle";

export interface TimelineEvent {
  kind: TimelineEventKind;
  summary: string;
  detail?: string;
  timestamp: number;
}

// ── Observer Suggestions ──
export type SuggestionAction =
  | { action: "fork-subagent"; prompt: string; model?: string }
  | { action: "switch-model"; model: string }
  | { action: "retry-different-approach"; prompt: string }
  | { action: "stop-agent" }
  | { action: "custom"; label: string; prompt: string };

export interface ObserverSuggestion {
  id: string;
  agentId: string;
  title: string;
  reasoning: string;
  suggestedAction: SuggestionAction;
  createdAt: number;
  applied: boolean;
}

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
  // Approval gates
  | { type: "approval:requested"; agentId: string; approval: PendingApproval; timestamp: number }
  | { type: "approval:resolved"; agentId: string; approvalId: string; accepted: boolean; timestamp: number }
  // Timeline
  | { type: "agent:timeline"; agentId: string; event: TimelineEvent; timestamp: number }
  // Observer suggestions
  | { type: "observer:suggestion"; suggestion: ObserverSuggestion; timestamp: number }
  | { type: "observer:apply"; suggestionId: string; timestamp: number }
  // Delegation
  | { type: "agent:delegate"; agentId: string; task: string; model?: string; runtime?: RuntimeType; timestamp: number }
  | { type: "agent:worker-result"; agentId: string; parentId: string; summary: string; timestamp: number }
  // User actions
  | { type: "user:spawn"; config: SpawnConfig; timestamp: number }
  | { type: "user:message"; agentId: string; message: string; timestamp: number }
  | { type: "user:broadcast"; message: string; timestamp: number };
