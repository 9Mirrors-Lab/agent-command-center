import type { AgentState } from "@acc/shared";
import { RUNTIME_INFO } from "@acc/shared";
import { formatTokens, formatCost, formatDuration } from "../lib/format";
import { useTick } from "../hooks/useTick";
import { TimelineBreadcrumb } from "./AgentTimeline";

interface Props {
  agent: AgentState;
  selected: boolean;
  onSelect: () => void;
  onStop: () => void;
  onResume: () => void;
  onHide: () => void;
}

const statusColors: Record<string, string> = {
  active: "bg-success",
  idle: "bg-warning",
  stopped: "bg-text-secondary",
  errored: "bg-error",
};

const statusBorderColors: Record<string, string> = {
  active: "border-success/30",
  idle: "border-warning/30",
  stopped: "border-border",
  errored: "border-error/30",
};

export default function AgentCard({ agent, selected, onSelect, onStop, onResume, onHide }: Props) {
  useTick(1000);
  const uptime = Date.now() - agent.startTime;
  const runningTool = agent.recentTools.findLast((t) => t.status === "running");
  const lastOutput = agent.outputLines[agent.outputLines.length - 1] ?? "";

  return (
    <div
      onClick={onSelect}
      className={`
        bg-surface border rounded-lg p-3 cursor-pointer transition-all
        ${selected ? "border-accent ring-1 ring-accent/30" : statusBorderColors[agent.status] ?? "border-border"}
        hover:bg-surface-hover
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColors[agent.status]}`} />
          {agent.role === "coordinator" && (
            <span className="text-[10px] font-bold px-1 rounded bg-accent/20 text-accent">C</span>
          )}
          {agent.role === "worker" && (
            <span className="text-[10px] font-bold px-1 rounded bg-warning/20 text-warning">W</span>
          )}
          <span className="text-sm font-medium truncate max-w-[160px]">{agent.name}</span>
          {(agent.runtime ?? "claude") !== "claude" && (
            <span className="text-[10px] px-1 rounded bg-surface-hover text-text-secondary">
              {RUNTIME_INFO[agent.runtime ?? "claude"]?.label ?? agent.runtime}
            </span>
          )}
          <span className="text-xs text-text-secondary">{agent.config.model ?? "sonnet"}</span>
          {agent.config.machine && (
            <span className="text-[10px] px-1 rounded bg-accent/10 text-accent">@{agent.config.machine}</span>
          )}
        </div>
        <span className="text-xs text-text-secondary">{formatDuration(uptime)}</span>
      </div>

      {/* Task */}
      <p className="text-xs text-text-secondary truncate mb-2">
        {agent.currentTask ?? "No task"}
      </p>

      {/* Timeline breadcrumb or active tool fallback */}
      {agent.timeline && agent.timeline.length > 0 ? (
        <TimelineBreadcrumb timeline={agent.timeline} />
      ) : runningTool ? (
        <div className="text-xs text-accent mb-2 truncate">
          {runningTool.tool}{runningTool.target ? `: ${runningTool.target}` : ""}
        </div>
      ) : null}

      {/* Last output preview */}
      {lastOutput && (
        <div className="text-xs text-text-secondary truncate mb-2 opacity-60">
          {lastOutput.slice(0, 80)}
        </div>
      )}

      {/* Footer: stats + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span>{formatTokens(agent.tokens.input + agent.tokens.output)} tok</span>
          <span>{formatCost(agent.cost)}</span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {(agent.status === "active" || agent.status === "idle") && (
            <button
              onClick={onStop}
              className="text-xs px-2 py-0.5 rounded bg-error/20 text-error hover:bg-error/30 transition-colors"
            >
              Stop
            </button>
          )}
          {(agent.status === "stopped" || agent.status === "errored") && (
            <button
              onClick={onResume}
              className="text-xs px-2 py-0.5 rounded bg-success/20 text-success hover:bg-success/30 transition-colors"
            >
              Resume
            </button>
          )}
          <button
            onClick={onHide}
            className="text-xs px-2 py-0.5 rounded bg-bg text-text-secondary hover:text-text-primary transition-colors"
            title="Hide"
          >
            x
          </button>
        </div>
      </div>
    </div>
  );
}
