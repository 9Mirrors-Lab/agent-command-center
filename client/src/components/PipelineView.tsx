import type { AgentState } from "@acc/shared";
import { formatTokens, formatCost, formatDuration } from "../lib/format";
import { useTick } from "../hooks/useTick";

interface Props {
  agents: AgentState[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const statusColors: Record<string, string> = {
  active: "border-success bg-success/10",
  idle: "border-warning bg-warning/10",
  stopped: "border-border bg-bg",
  errored: "border-error bg-error/10",
};

const statusDotColors: Record<string, string> = {
  active: "bg-success",
  idle: "bg-warning",
  stopped: "bg-text-secondary",
  errored: "bg-error",
};

interface DelegationTree {
  root: AgentState;
  children: AgentState[];
}

function buildTrees(agents: AgentState[]): DelegationTree[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const childIds = new Set(
    agents.filter((a) => a.workerAssignment?.parentId).map((a) => a.id)
  );
  const trees: DelegationTree[] = [];

  for (const agent of agents) {
    if (childIds.has(agent.id)) continue; // Skip workers, they're under their parent

    const children = (agent.childAgentIds ?? [])
      .map((id) => byId.get(id))
      .filter((a): a is AgentState => !!a);

    trees.push({ root: agent, children });
  }

  return trees;
}

function PipelineNode({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentState;
  selected: boolean;
  onSelect: () => void;
}) {
  useTick(1000);
  const uptime = Date.now() - agent.startTime;

  return (
    <div
      onClick={onSelect}
      className={`
        border rounded-lg px-3 py-2 cursor-pointer transition-all min-w-[220px] max-w-[280px]
        ${selected ? "ring-2 ring-accent" : ""} ${statusColors[agent.status]}
      `}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotColors[agent.status]}`} />
        <span className="text-xs font-medium truncate">{agent.name}</span>
        {agent.role === "coordinator" && (
          <span className="text-[10px] font-bold px-1 rounded bg-accent/20 text-accent">C</span>
        )}
        {agent.role === "worker" && (
          <span className="text-[10px] font-bold px-1 rounded bg-warning/20 text-warning">W</span>
        )}
      </div>
      <p className="text-[10px] text-text-secondary truncate mb-1">
        {agent.currentTask ?? "No task"}
      </p>
      <div className="flex items-center gap-2 text-[10px] text-text-secondary">
        <span>{formatDuration(uptime)}</span>
        <span>{formatTokens(agent.tokens.input + agent.tokens.output)} tok</span>
        <span>{formatCost(agent.cost)}</span>
      </div>
    </div>
  );
}

export default function PipelineView({ agents, selectedId, onSelect }: Props) {
  const trees = buildTrees(agents);

  if (agents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">
        No agents running. Click "Spawn Agent" to start one.
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 overflow-auto">
      <div className="flex flex-col gap-4">
        {trees.map((tree) => (
          <div key={tree.root.id} className="flex items-start gap-0">
            {/* Root node */}
            <PipelineNode
              agent={tree.root}
              selected={tree.root.id === selectedId}
              onSelect={() => onSelect(tree.root.id === selectedId ? null : tree.root.id)}
            />

            {/* Arrow + children */}
            {tree.children.length > 0 && (
              <>
                {/* Connecting line */}
                <div className="flex items-center self-center">
                  <div className="w-6 h-px bg-border" />
                  <svg width="8" height="12" className="text-border flex-shrink-0">
                    <path d="M0,0 L8,6 L0,12" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>

                {/* Worker column */}
                <div className="flex flex-col gap-2">
                  {tree.children.map((child) => (
                    <PipelineNode
                      key={child.id}
                      agent={child}
                      selected={child.id === selectedId}
                      onSelect={() => onSelect(child.id === selectedId ? null : child.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
