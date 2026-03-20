import { useReducer, useCallback } from "react";
import type { AgentState, BusMessage, SpawnConfig, AgentSummary, PendingApproval, ObserverSuggestion } from "@acc/shared";
import { MODEL_PRICING } from "@acc/shared";
import { useBus, getServerUrl } from "./useBus";

interface State {
  agents: Map<string, AgentState>;
  stats: {
    total: number;
    active: number;
    idle: number;
    stopped: number;
    totalTokens: { input: number; output: number };
    totalCost: number;
  };
  managerSummary: string | null;
  managerAssessments: AgentSummary[];
  alerts: Array<{ agentId: string; alert: string; severity: string; timestamp: number }>;
  pendingApprovals: PendingApproval[];
  observerSuggestions: ObserverSuggestion[];
  filter: "all" | "active" | "idle" | "stopped";
  hiddenAgents: Set<string>;
  selectedAgent: string | null;
}

type Action =
  | { type: "SNAPSHOT"; agents: AgentState[]; stats: any }
  | { type: "BUS_MESSAGE"; msg: BusMessage }
  | { type: "SET_FILTER"; filter: State["filter"] }
  | { type: "TOGGLE_HIDDEN"; agentId: string }
  | { type: "SELECT_AGENT"; agentId: string | null }
  | { type: "DISMISS_SUGGESTION"; suggestionId: string }
  | { type: "APPLY_SUGGESTION"; suggestionId: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SNAPSHOT": {
      const agents = new Map(action.agents.map((a) => [a.id, a]));
      return { ...state, agents, stats: action.stats };
    }

    case "BUS_MESSAGE": {
      const msg = action.msg;
      const agents = new Map(state.agents);

      switch (msg.type) {
        case "agent:spawned": {
          const newAgent: AgentState = {
            id: msg.agentId,
            name: msg.config.name ?? `Agent ${msg.agentId.slice(0, 6)}`,
            status: "active",
            config: msg.config,
            sessionId: "",
            tokens: { input: 0, output: 0 },
            cost: 0,
            startTime: msg.timestamp,
            lastActivity: msg.timestamp,
            currentTask: msg.config.prompt.slice(0, 100),
            recentTools: [],
            outputLines: [],
            timeline: [],
            pendingApprovals: [],
            runtime: msg.config.runtime ?? "claude",
            role: msg.config.role ?? "standalone",
            workerAssignment: msg.config.workerAssignment,
            childAgentIds: [],
          };
          agents.set(msg.agentId, newAgent);
          // Track child on parent coordinator
          if (msg.config.workerAssignment?.parentId) {
            const parent = agents.get(msg.config.workerAssignment.parentId);
            if (parent) {
              agents.set(parent.id, {
                ...parent,
                childAgentIds: [...parent.childAgentIds, msg.agentId],
              });
            }
          }
          break;
        }

        case "agent:status": {
          const agent = agents.get(msg.agentId);
          if (agent) agents.set(msg.agentId, { ...agent, status: msg.status, lastActivity: msg.timestamp });
          break;
        }

        case "agent:stopped": {
          const agent = agents.get(msg.agentId);
          if (agent) agents.set(msg.agentId, { ...agent, status: "stopped", lastActivity: msg.timestamp });
          break;
        }

        case "agent:text": {
          const agent = agents.get(msg.agentId);
          if (agent) {
            const lines = [...agent.outputLines, msg.content].slice(-500);
            agents.set(msg.agentId, { ...agent, outputLines: lines, lastActivity: msg.timestamp });
          }
          break;
        }

        case "agent:tool_use": {
          const agent = agents.get(msg.agentId);
          if (agent) {
            const tools = [...agent.recentTools, {
              tool: msg.tool, target: msg.target, status: "running" as const,
              startTime: msg.timestamp,
            }].slice(-20);
            agents.set(msg.agentId, { ...agent, recentTools: tools, lastActivity: msg.timestamp });
          }
          break;
        }

        case "agent:tool_result": {
          const agent = agents.get(msg.agentId);
          if (agent) {
            const tools = agent.recentTools.map((t) =>
              t.status === "running" ? { ...t, status: msg.success ? "completed" as const : "error" as const, endTime: msg.timestamp } : t
            );
            agents.set(msg.agentId, { ...agent, recentTools: tools, lastActivity: msg.timestamp });
          }
          break;
        }

        case "agent:tokens": {
          const agent = agents.get(msg.agentId);
          if (agent) {
            const newTokens = { input: agent.tokens.input + msg.input, output: agent.tokens.output + msg.output };
            let cost = agent.cost;
            if ((agent.runtime ?? "claude") === "claude") {
              const model = agent.config.model ?? "sonnet";
              const pricing = MODEL_PRICING[model] ?? MODEL_PRICING.sonnet;
              cost = newTokens.input * pricing.input + newTokens.output * pricing.output;
            }
            agents.set(msg.agentId, {
              ...agent,
              tokens: newTokens,
              cost,
              lastActivity: msg.timestamp,
            });
          }
          break;
        }

        case "agent:worker-result": {
          const worker = agents.get(msg.agentId);
          if (worker?.workerAssignment) {
            agents.set(msg.agentId, {
              ...worker,
              workerAssignment: { ...worker.workerAssignment, completedAt: msg.timestamp, result: msg.summary },
            });
          }
          break;
        }

        case "manager:summary":
          return {
            ...state,
            agents,
            managerSummary: msg.summary,
            managerAssessments: msg.agentStates,
          };

        case "manager:alert":
          return {
            ...state,
            agents,
            alerts: [...state.alerts, { agentId: msg.agentId, alert: msg.alert, severity: msg.severity, timestamp: msg.timestamp }].slice(-20),
          };

        case "approval:requested":
          return {
            ...state,
            agents,
            pendingApprovals: [...state.pendingApprovals, msg.approval],
          };

        case "approval:resolved":
          return {
            ...state,
            agents,
            pendingApprovals: state.pendingApprovals.filter((a) => a.id !== msg.approvalId),
          };

        case "agent:timeline": {
          const agent = agents.get(msg.agentId);
          if (agent) {
            const timeline = [...agent.timeline, msg.event].slice(-100);
            agents.set(msg.agentId, { ...agent, timeline, lastActivity: msg.timestamp });
          }
          break;
        }

        case "observer:suggestion":
          return {
            ...state,
            agents,
            observerSuggestions: [...state.observerSuggestions, msg.suggestion],
          };

        case "observer:apply":
          return {
            ...state,
            agents,
            observerSuggestions: state.observerSuggestions.map((s) =>
              s.id === msg.suggestionId ? { ...s, applied: true } : s
            ),
          };
      }

      // Recalculate stats
      const allAgents = Array.from(agents.values());
      const stats = {
        total: allAgents.length,
        active: allAgents.filter((a) => a.status === "active").length,
        idle: allAgents.filter((a) => a.status === "idle").length,
        stopped: allAgents.filter((a) => a.status === "stopped" || a.status === "errored").length,
        totalTokens: allAgents.reduce((acc, a) => ({
          input: acc.input + a.tokens.input,
          output: acc.output + a.tokens.output,
        }), { input: 0, output: 0 }),
        totalCost: allAgents.reduce((acc, a) => acc + a.cost, 0),
      };

      return { ...state, agents, stats };
    }

    case "SET_FILTER":
      return { ...state, filter: action.filter };

    case "TOGGLE_HIDDEN": {
      const hidden = new Set(state.hiddenAgents);
      if (hidden.has(action.agentId)) hidden.delete(action.agentId);
      else hidden.add(action.agentId);
      return { ...state, hiddenAgents: hidden };
    }

    case "SELECT_AGENT":
      return { ...state, selectedAgent: action.agentId };

    case "DISMISS_SUGGESTION":
      return {
        ...state,
        observerSuggestions: state.observerSuggestions.filter((s) => s.id !== action.suggestionId),
      };

    case "APPLY_SUGGESTION":
      return {
        ...state,
        observerSuggestions: state.observerSuggestions.map((s) =>
          s.id === action.suggestionId ? { ...s, applied: true } : s
        ),
      };

    default:
      return state;
  }
}

const initialState: State = {
  agents: new Map(),
  stats: { total: 0, active: 0, idle: 0, stopped: 0, totalTokens: { input: 0, output: 0 }, totalCost: 0 },
  managerSummary: null,
  managerAssessments: [],
  alerts: [],
  pendingApprovals: [],
  observerSuggestions: [],
  filter: "all",
  hiddenAgents: new Set(),
  selectedAgent: null,
};

export function useAgents() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const { connected, send } = useBus((msg) => {
    if (msg.type === "snapshot") {
      dispatch({ type: "SNAPSHOT", agents: msg.agents, stats: msg.stats });
    } else {
      dispatch({ type: "BUS_MESSAGE", msg: msg as BusMessage });
    }
  });

  const spawnAgent = useCallback(async (config: SpawnConfig) => {
    const res = await fetch(`${getServerUrl()}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    return res.json();
  }, []);

  const stopAgent = useCallback((agentId: string) => {
    send({ type: "agent:stop", agentId, from: "user", timestamp: Date.now() });
  }, [send]);

  const resumeAgent = useCallback((agentId: string) => {
    send({ type: "agent:resume", agentId, from: "user", timestamp: Date.now() });
  }, [send]);

  const promptAgent = useCallback((agentId: string, prompt: string) => {
    send({ type: "agent:prompt", agentId, prompt, from: "user", timestamp: Date.now() });
  }, [send]);

  const broadcastMessage = useCallback((message: string) => {
    send({ type: "user:broadcast", message, timestamp: Date.now() });
  }, [send]);

  const acceptApproval = useCallback(async (approvalId: string) => {
    await fetch(`${getServerUrl()}/api/approvals/${approvalId}/accept`, { method: "POST" });
  }, []);

  const rejectApproval = useCallback(async (approvalId: string) => {
    await fetch(`${getServerUrl()}/api/approvals/${approvalId}/reject`, { method: "POST" });
  }, []);

  const acceptAllApprovals = useCallback(async () => {
    await fetch(`${getServerUrl()}/api/approvals/accept-all`, { method: "POST" });
  }, []);

  const applySuggestion = useCallback(async (suggestionId: string) => {
    // Optimistically mark as applied
    dispatch({ type: "APPLY_SUGGESTION", suggestionId });
    try {
      await fetch(`${getServerUrl()}/api/observer/suggestions/${suggestionId}/apply`, { method: "POST" });
    } catch (err) {
      console.error("Failed to apply suggestion:", err);
    }
  }, []);

  const dismissSuggestion = useCallback((suggestionId: string) => {
    dispatch({ type: "DISMISS_SUGGESTION", suggestionId });
  }, []);

  const filteredAgents = Array.from(state.agents.values()).filter((a) => {
    if (state.hiddenAgents.has(a.id)) return false;
    if (state.filter === "all") return true;
    if (state.filter === "stopped") return a.status === "stopped" || a.status === "errored";
    return a.status === state.filter;
  });

  return {
    ...state,
    connected,
    filteredAgents,
    spawnAgent,
    stopAgent,
    resumeAgent,
    promptAgent,
    broadcastMessage,
    acceptApproval,
    rejectApproval,
    acceptAllApprovals,
    applySuggestion,
    dismissSuggestion,
    setFilter: (filter: State["filter"]) => dispatch({ type: "SET_FILTER", filter }),
    toggleHidden: (id: string) => dispatch({ type: "TOGGLE_HIDDEN", agentId: id }),
    selectAgent: (id: string | null) => dispatch({ type: "SELECT_AGENT", agentId: id }),
  };
}
