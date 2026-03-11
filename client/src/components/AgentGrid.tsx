import type { AgentState } from "@acc/shared";
import AgentCard from "./AgentCard";

interface Props {
  agents: AgentState[];
  selectedId: string | null;
  focusedId?: string | null;
  onSelect: (id: string | null) => void;
  onStop: (id: string) => void;
  onResume: (id: string) => void;
  onToggleHidden: (id: string) => void;
}

export default function AgentGrid({ agents, selectedId, focusedId, onSelect, onStop, onResume, onToggleHidden }: Props) {
  if (agents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">
        No agents running. Click "Spawn Agent" to start one.
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 overflow-auto">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={focusedId === agent.id && focusedId !== selectedId ? "ring-1 ring-accent/50 rounded-lg" : ""}
          >
            <AgentCard
              agent={agent}
              selected={agent.id === selectedId}
              onSelect={() => onSelect(agent.id === selectedId ? null : agent.id)}
              onStop={() => onStop(agent.id)}
              onResume={() => onResume(agent.id)}
              onHide={() => onToggleHidden(agent.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
