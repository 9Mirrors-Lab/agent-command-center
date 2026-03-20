import type { AgentState } from "@acc/shared";
import AgentDetail from "./AgentDetail";

interface Props {
  agent: AgentState | null;
  agents: AgentState[];
  onSelect: (id: string | null) => void;
  onPrompt: (agentId: string, prompt: string) => void;
  onStop: (agentId: string) => void;
  onResume: (agentId: string) => void;
}

export default function FocusView({ agent, agents, onSelect, onPrompt, onStop, onResume }: Props) {
  if (!agent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-secondary text-sm gap-3">
        <p>Select an agent to focus on</p>
        {agents.length > 0 && (
          <div className="flex flex-wrap gap-2 max-w-md justify-center">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className="px-3 py-1.5 text-xs bg-surface border border-border rounded hover:border-accent transition-colors"
              >
                {a.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AgentDetail
        agent={agent}
        onClose={() => onSelect(null)}
        onPrompt={(prompt) => onPrompt(agent.id, prompt)}
        onStop={() => onStop(agent.id)}
        onResume={() => onResume(agent.id)}
        fullHeight
      />
    </div>
  );
}
