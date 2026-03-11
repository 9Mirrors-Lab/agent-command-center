import { useAgents } from "./hooks/useAgents";
import TopBar from "./components/TopBar";
import ManagerPanel from "./components/ManagerPanel";
import AgentGrid from "./components/AgentGrid";
import AgentDetail from "./components/AgentDetail";
import SpawnDialog from "./components/SpawnDialog";
import BroadcastBar from "./components/BroadcastBar";
import { useState } from "react";

export default function App() {
  const agents = useAgents();
  const [showSpawn, setShowSpawn] = useState(false);

  const selectedAgent = agents.selectedAgent
    ? agents.agents.get(agents.selectedAgent) ?? null
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        stats={agents.stats}
        connected={agents.connected}
        filter={agents.filter}
        onFilterChange={agents.setFilter}
        onSpawn={() => setShowSpawn(true)}
      />

      {agents.managerSummary && (
        <ManagerPanel
          summary={agents.managerSummary}
          assessments={agents.managerAssessments}
          alerts={agents.alerts}
        />
      )}

      <BroadcastBar onBroadcast={agents.broadcastMessage} />

      <AgentGrid
        agents={agents.filteredAgents}
        selectedId={agents.selectedAgent}
        onSelect={agents.selectAgent}
        onStop={agents.stopAgent}
        onResume={agents.resumeAgent}
        onToggleHidden={agents.toggleHidden}
      />

      {selectedAgent && (
        <AgentDetail
          agent={selectedAgent}
          onClose={() => agents.selectAgent(null)}
          onPrompt={(prompt) => agents.promptAgent(selectedAgent.id, prompt)}
          onStop={() => agents.stopAgent(selectedAgent.id)}
          onResume={() => agents.resumeAgent(selectedAgent.id)}
        />
      )}

      {showSpawn && (
        <SpawnDialog
          onSpawn={agents.spawnAgent}
          onClose={() => setShowSpawn(false)}
        />
      )}
    </div>
  );
}
