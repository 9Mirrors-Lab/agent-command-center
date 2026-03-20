import type { ViewMode } from "@acc/shared";
import { formatTokens, formatCost } from "../lib/format";

interface Props {
  stats: {
    total: number;
    active: number;
    idle: number;
    stopped: number;
    totalTokens: { input: number; output: number };
    totalCost: number;
  };
  connected: boolean;
  filter: "all" | "active" | "idle" | "stopped";
  onFilterChange: (filter: "all" | "active" | "idle" | "stopped") => void;
  onSpawn: () => void;
  managerEnabled: boolean;
  onToggleManager: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const viewModeLabels: Record<ViewMode, string> = {
  grid: "Grid",
  pipeline: "Pipeline",
  focus: "Focus",
};

export default function TopBar({ stats, connected, filter, onFilterChange, onSpawn, managerEnabled, onToggleManager, viewMode, onViewModeChange }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
      {/* Left: Title + connection */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold tracking-wide">AGENT COMMAND CENTER</h1>
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-success" : "bg-error"}`} />
      </div>

      {/* Center: Stats pills */}
      <div className="flex items-center gap-4 text-xs">
        <Pill label="Active" value={stats.active} color="text-success" />
        <Pill label="Idle" value={stats.idle} color="text-warning" />
        <Pill label="Stopped" value={stats.stopped} color="text-error" />
        <span className="text-text-secondary">|</span>
        <span className="text-text-secondary">
          {formatTokens(stats.totalTokens.input + stats.totalTokens.output)} tokens
        </span>
        <span className="text-text-secondary">{formatCost(stats.totalCost)}</span>
      </div>

      {/* Right: View mode + Filter + Spawn */}
      <div className="flex items-center gap-2">
        {/* View mode toggle */}
        <div className="flex bg-bg rounded border border-border">
          {(["grid", "pipeline", "focus"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                viewMode === mode
                  ? "bg-accent/20 text-accent"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {viewModeLabels[mode]}
            </button>
          ))}
        </div>

        <select
          value={filter}
          onChange={(e) => onFilterChange(e.target.value as any)}
          className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-primary"
        >
          <option value="all">All ({stats.total})</option>
          <option value="active">Active ({stats.active})</option>
          <option value="idle">Idle ({stats.idle})</option>
          <option value="stopped">Stopped ({stats.stopped})</option>
        </select>

        <button
          onClick={onToggleManager}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            managerEnabled
              ? "bg-accent/20 text-accent hover:bg-accent/30"
              : "bg-bg text-text-secondary hover:text-text-primary border border-border"
          }`}
        >
          Manager {managerEnabled ? "ON" : "OFF"}
        </button>

        <button
          onClick={onSpawn}
          className="bg-accent text-bg px-3 py-1 rounded text-xs font-medium hover:opacity-90 transition-opacity"
        >
          + Spawn Agent
        </button>
      </div>
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={color}>{value}</span>
      <span className="text-text-secondary">{label}</span>
    </span>
  );
}
