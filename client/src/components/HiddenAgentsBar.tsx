import type { AgentState } from "@acc/shared";
import { useState } from "react";

interface Props {
  hiddenAgents: AgentState[];
  onUnhide: (id: string) => void;
}

const statusColors: Record<string, string> = {
  active: "text-success",
  idle: "text-warning",
  stopped: "text-text-secondary",
  errored: "text-error",
};

export default function HiddenAgentsBar({ hiddenAgents, onUnhide }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (hiddenAgents.length === 0) return null;

  return (
    <div className="px-4 py-1.5 border-t border-border bg-surface/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
      >
        <span className="text-text-secondary">{expanded ? "v" : ">"}</span>
        {hiddenAgents.length} hidden agent{hiddenAgents.length !== 1 ? "s" : ""}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {hiddenAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between text-xs py-1 px-2 rounded bg-bg"
            >
              <div className="flex items-center gap-2">
                <span className={statusColors[agent.status] ?? "text-text-secondary"}>
                  {agent.status}
                </span>
                <span className="text-text-primary">{agent.name}</span>
              </div>
              <button
                onClick={() => onUnhide(agent.id)}
                className="px-2 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
              >
                Show
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
