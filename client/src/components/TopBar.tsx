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
}

export default function TopBar({ stats, connected, filter, onFilterChange, onSpawn }: Props) {
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

      {/* Right: Filter + Spawn */}
      <div className="flex items-center gap-2">
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
