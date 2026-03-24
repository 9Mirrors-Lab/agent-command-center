import type { ViewMode } from "@acc/shared";
import { useAgents } from "./hooks/useAgents";
import { useKeyboard } from "./hooks/useKeyboard";
import { isConfigured, getServerUrl, tryAutoConfig } from "./hooks/useBus";
import TopBar from "./components/TopBar";
import ManagerPanel from "./components/ManagerPanel";
import AgentGrid from "./components/AgentGrid";
import AgentDetail from "./components/AgentDetail";
import PipelineView from "./components/PipelineView";
import FocusView from "./components/FocusView";
import ActivityFeed from "./components/ActivityFeed";
import ReplayBar, { getAgentsAtTimestamp } from "./components/ReplayBar";
import WorkspaceGraph from "./components/WorkspaceGraph";
import SpawnDialog from "./components/SpawnDialog";
import BroadcastBar from "./components/BroadcastBar";
import HiddenAgentsBar from "./components/HiddenAgentsBar";
import ApprovalQueue from "./components/ApprovalQueue";
import ObserverPanel from "./components/ObserverPanel";
import ConnectionStatus from "./components/ConnectionStatus";
import ErrorBoundary from "./components/ErrorBoundary";
import SetupScreen from "./components/SetupScreen";
import DetectedSessions from "./components/DetectedSessions";
import LearningsPanel from "./components/LearningsPanel";
import TradingPanel from "./components/TradingPanel";
import McpToolsPanel from "./components/McpToolsPanel";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";

const VIEW_CYCLE: ViewMode[] = ["grid", "pipeline", "focus", "activity", "graph"];

function AppContent() {
  const agents = useAgents();
  const [showSpawn, setShowSpawn] = useState(false);
  const [managerEnabled, setManagerEnabled] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showSettings, setShowSettings] = useState(false);
  const [showDetected, setShowDetected] = useState(true);
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [replayState, setReplayState] = useState({ enabled: false, timestamp: Date.now(), playing: false });
  const broadcastRef = useRef<HTMLButtonElement>(null);

  const selectedAgent = agents.selectedAgent
    ? agents.agents.get(agents.selectedAgent) ?? null
    : null;

  const hiddenAgents = useMemo(() => {
    return Array.from(agents.agents.values()).filter((a) =>
      agents.hiddenAgents.has(a.id)
    );
  }, [agents.agents, agents.hiddenAgents]);

  const toggleManager = useCallback(async () => {
    const endpoint = managerEnabled ? "/api/manager/stop" : "/api/manager/start";
    try {
      await fetch(`${getServerUrl()}${endpoint}`, { method: "POST" });
      setManagerEnabled(!managerEnabled);
    } catch (err) {
      console.error("Manager toggle failed:", err);
    }
  }, [managerEnabled]);

  const keyboardActions = useMemo(() => ({
    onSpawn: () => setShowSpawn(true),
    onEscape: () => {
      if (showSpawn) {
        setShowSpawn(false);
      } else if (showSettings) {
        setShowSettings(false);
      } else if (agents.selectedAgent) {
        agents.selectAgent(null);
      }
    },
    onNavigate: (direction: "up" | "down") => {
      const list = agents.filteredAgents;
      if (list.length === 0) return;
      setFocusedIndex((prev) => {
        if (direction === "down") {
          return prev < list.length - 1 ? prev + 1 : 0;
        } else {
          return prev > 0 ? prev - 1 : list.length - 1;
        }
      });
    },
    onSelect: () => {
      const list = agents.filteredAgents;
      if (focusedIndex >= 0 && focusedIndex < list.length) {
        const agent = list[focusedIndex];
        agents.selectAgent(agent.id === agents.selectedAgent ? null : agent.id);
      }
    },
    onStop: () => {
      if (agents.selectedAgent) {
        agents.stopAgent(agents.selectedAgent);
      } else {
        const list = agents.filteredAgents;
        if (focusedIndex >= 0 && focusedIndex < list.length) {
          agents.stopAgent(list[focusedIndex].id);
        }
      }
    },
    onResume: () => {
      if (agents.selectedAgent) {
        agents.resumeAgent(agents.selectedAgent);
      } else {
        const list = agents.filteredAgents;
        if (focusedIndex >= 0 && focusedIndex < list.length) {
          agents.resumeAgent(list[focusedIndex].id);
        }
      }
    },
    onBroadcast: () => {
      broadcastRef.current?.click();
    },
    onSelectIndex: (index: number) => {
      const list = agents.filteredAgents;
      if (index < list.length) {
        setFocusedIndex(index);
        agents.selectAgent(list[index].id === agents.selectedAgent ? null : list[index].id);
      }
    },
    onToggleManager: toggleManager,
    onCycleView: () => {
      setViewMode((prev) => {
        const idx = VIEW_CYCLE.indexOf(prev);
        return VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length];
      });
    },
    onActivityView: () => setViewMode("activity"),
  }), [showSpawn, showSettings, agents, focusedIndex, toggleManager]);

  useKeyboard(keyboardActions);

  // Compute display agents (apply replay filtering if active)
  const displayAgents = useMemo(() => {
    if (replayState.enabled) {
      return getAgentsAtTimestamp(agents.filteredAgents, replayState.timestamp);
    }
    return agents.filteredAgents;
  }, [agents.filteredAgents, replayState.enabled, replayState.timestamp]);

  // Sync focusedIndex with selectedAgent
  const focusedId = focusedIndex >= 0 && focusedIndex < displayAgents.length
    ? displayAgents[focusedIndex].id
    : null;

  if (showSettings) {
    return (
      <SetupScreen
        onComplete={() => {
          setShowSettings(false);
          window.location.reload();
        }}
        isReconfigure
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        stats={agents.stats}
        connected={agents.connected}
        filter={agents.filter}
        onFilterChange={agents.setFilter}
        onSpawn={() => setShowSpawn(true)}
        managerEnabled={managerEnabled}
        onToggleManager={toggleManager}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenSettings={() => setShowSettings(true)}
        tradingEnabled={tradingEnabled}
        onToggleTrading={() => setTradingEnabled(!tradingEnabled)}
      />

      {agents.pendingApprovals.length > 0 && (
        <ApprovalQueue
          approvals={agents.pendingApprovals}
          agents={agents.agents}
          onAccept={agents.acceptApproval}
          onReject={agents.rejectApproval}
          onAcceptAll={agents.acceptAllApprovals}
        />
      )}

      {agents.managerSummary && (
        <ManagerPanel
          summary={agents.managerSummary}
          assessments={agents.managerAssessments}
          alerts={agents.alerts}
        />
      )}

      <ObserverPanel
        suggestions={agents.observerSuggestions}
        agents={agents.agents}
        onApply={agents.applySuggestion}
        onDismiss={agents.dismissSuggestion}
      />

      {showDetected && (
        <DetectedSessions onDismiss={() => setShowDetected(false)} />
      )}

      <TradingPanel enabled={tradingEnabled} />

      <LearningsPanel
        learnings={agents.learnings}
        onAdd={agents.addLearning}
      />

      <McpToolsPanel visible={tradingEnabled} />

      <BroadcastBar onBroadcast={agents.broadcastMessage} ref={broadcastRef} />

      {/* Main content area — switches based on view mode */}
      {viewMode === "grid" && (
        <AgentGrid
          agents={displayAgents}
          selectedId={agents.selectedAgent}
          focusedId={focusedId}
          onSelect={agents.selectAgent}
          onStop={agents.stopAgent}
          onResume={agents.resumeAgent}
          onToggleHidden={agents.toggleHidden}
        />
      )}

      {viewMode === "pipeline" && (
        <PipelineView
          agents={displayAgents}
          selectedId={agents.selectedAgent}
          onSelect={agents.selectAgent}
        />
      )}

      {viewMode === "focus" && (
        <FocusView
          agent={selectedAgent}
          agents={displayAgents}
          onSelect={agents.selectAgent}
          onPrompt={agents.promptAgent}
          onStop={agents.stopAgent}
          onResume={agents.resumeAgent}
        />
      )}

      {viewMode === "activity" && (
        <ActivityFeed
          agents={agents.agents}
          onSelectAgent={(id) => {
            agents.selectAgent(id);
            setViewMode("grid");
          }}
        />
      )}

      {viewMode === "graph" && (
        <WorkspaceGraph
          agents={displayAgents}
          learnings={agents.learnings}
          selectedId={agents.selectedAgent}
          onSelect={agents.selectAgent}
        />
      )}

      {viewMode !== "focus" && viewMode !== "activity" && (
        <>
          <HiddenAgentsBar
            hiddenAgents={hiddenAgents}
            onUnhide={agents.toggleHidden}
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
        </>
      )}

      {/* Replay Bar — docked at bottom */}
      <ReplayBar
        agents={agents.filteredAgents}
        replayState={replayState}
        onReplayChange={setReplayState}
      />

      {showSpawn && (
        <SpawnDialog
          onSpawn={agents.spawnAgent}
          onClose={() => setShowSpawn(false)}
        />
      )}

      <ConnectionStatus connected={agents.connected} />
    </div>
  );
}

export default function App() {
  const [configured, setConfigured] = useState(isConfigured());
  const [checking, setChecking] = useState(!isConfigured());

  // Try auto-detecting the server on first load
  useEffect(() => {
    if (configured) return;
    tryAutoConfig().then((ok) => {
      if (ok) setConfigured(true);
      setChecking(false);
    });
  }, [configured]);

  // Show nothing while auto-detecting (< 2s)
  if (checking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-sm text-text-secondary">Connecting...</div>
      </div>
    );
  }

  if (!configured) {
    return (
      <SetupScreen
        onComplete={() => setConfigured(true)}
      />
    );
  }

  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
