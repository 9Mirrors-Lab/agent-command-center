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

/**
 * Sort agents so workers appear directly after their parent coordinator,
 * with a visual indent. Standalone agents appear in original order.
 */
function sortWithDelegation(agents: AgentState[]): AgentState[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const used = new Set<string>();
  const sorted: AgentState[] = [];

  for (const agent of agents) {
    if (used.has(agent.id)) continue;

    sorted.push(agent);
    used.add(agent.id);

    // If coordinator, insert children immediately after
    if (agent.role === "coordinator" && agent.childAgentIds?.length) {
      for (const childId of agent.childAgentIds) {
        const child = byId.get(childId);
        if (child && !used.has(childId)) {
          sorted.push(child);
          used.add(childId);
        }
      }
    }
  }

  return sorted;
}

export default function AgentGrid({ agents, selectedId, focusedId, onSelect, onStop, onResume, onToggleHidden }: Props) {
  if (agents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">
        No agents running. Click "Spawn Agent" to start one.
      </div>
    );
  }

  const sorted = sortWithDelegation(agents);

  return (
    <div className="flex-1 p-4 overflow-auto">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {sorted.map((agent) => (
          <div
            key={agent.id}
            className={`
              ${focusedId === agent.id && focusedId !== selectedId ? "ring-1 ring-accent/50 rounded-lg" : ""}
              ${agent.role === "worker" ? "ml-4" : ""}
            `}
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
