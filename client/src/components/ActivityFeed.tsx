import { useState, useEffect, useCallback, useRef } from "react";
import type { ActivityEntry, ActivityKind, AgentState } from "@acc/shared";
import { getServerUrl } from "../hooks/useBus";
import { formatDuration } from "../lib/format";

interface Props {
  agents: Map<string, AgentState>;
  onSelectAgent: (agentId: string) => void;
}

const KIND_ICONS: Record<ActivityKind, string> = {
  tool: "T",
  decision: "D",
  phase: "P",
  error: "!",
  spawn: "+",
  stop: "x",
  approval: "?",
  delegation: ">",
  learning: "L",
};

const KIND_COLORS: Record<ActivityKind, string> = {
  tool: "text-text-secondary",
  decision: "text-accent",
  phase: "text-success",
  error: "text-error",
  spawn: "text-success",
  stop: "text-warning",
  approval: "text-warning",
  delegation: "text-accent",
  learning: "text-purple-400",
};

function timeGroupLabel(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 3_600_000 * 10) / 10}h ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return "While you were away";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ActivityFeed({ agents, onSelectAgent }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [filterKind, setFilterKind] = useState<ActivityKind | "all">("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEntries = useCallback(() => {
    fetch(`${getServerUrl()}/api/activity?limit=200`)
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) setEntries(data.entries);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEntries();
    intervalRef.current = setInterval(fetchEntries, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchEntries]);

  const filtered = entries
    .filter((e) => filterKind === "all" || e.kind === filterKind)
    .filter((e) => filterAgent === "all" || e.agentId === filterAgent)
    .reverse(); // newest first

  // Group entries by time bucket
  const groups: { label: string; entries: ActivityEntry[] }[] = [];
  let currentLabel = "";
  for (const entry of filtered) {
    const label = timeGroupLabel(entry.timestamp);
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, entries: [] });
    }
    groups[groups.length - 1].entries.push(entry);
  }

  const uniqueAgents = [...new Set(entries.map((e) => e.agentId))];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface">
        <span className="text-xs font-bold text-text-secondary tracking-wide">ACTIVITY FEED</span>
        <span className="text-xs text-text-secondary">({filtered.length} events)</span>

        <div className="flex-1" />

        {/* Agent filter */}
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-primary"
        >
          <option value="all">All Agents</option>
          {uniqueAgents.map((id) => {
            const agent = agents.get(id);
            return (
              <option key={id} value={id}>
                {agent?.name ?? id.slice(0, 8)}
              </option>
            );
          })}
        </select>

        {/* Kind filter */}
        <select
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value as any)}
          className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-primary"
        >
          <option value="all">All Types</option>
          {(Object.keys(KIND_ICONS) as ActivityKind[]).map((kind) => (
            <option key={kind} value={kind}>{kind}</option>
          ))}
        </select>

        <button
          onClick={() => {
            setSummaryLoading(true);
            // Generate client-side summary from entries (no AI endpoint needed)
            const recentEntries = entries.slice(-50);
            const agentCounts: Record<string, number> = {};
            const kindCounts: Record<string, number> = {};
            for (const e of recentEntries) {
              agentCounts[e.agentName] = (agentCounts[e.agentName] || 0) + 1;
              kindCounts[e.kind] = (kindCounts[e.kind] || 0) + 1;
            }
            const timeRange = recentEntries.length > 0
              ? formatDuration(Date.now() - recentEntries[0].timestamp)
              : "no time";
            const agentSummary = Object.entries(agentCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => `${name}: ${count} events`)
              .join(", ");
            const kindSummary = Object.entries(kindCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([kind, count]) => `${count} ${kind}`)
              .join(", ");
            const errors = recentEntries.filter((e) => e.kind === "error");
            const errorNote = errors.length > 0
              ? `\n\nErrors (${errors.length}): ${errors.slice(-3).map((e) => e.summary).join("; ")}`
              : "";

            setSummaryText(
              `Last ${timeRange} — ${recentEntries.length} events\n` +
              `Agents: ${agentSummary}\n` +
              `Activity: ${kindSummary}${errorNote}`
            );
            setSummaryLoading(false);
          }}
          disabled={summaryLoading}
          className="px-3 py-1 rounded text-xs font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-50"
        >
          {summaryLoading ? "..." : "Summarize"}
        </button>
      </div>

      {/* Summary banner */}
      {summaryText && (
        <div className="px-4 py-3 bg-accent/10 border-b border-accent/20 relative">
          <pre className="text-xs text-text-primary whitespace-pre-wrap font-mono">{summaryText}</pre>
          <button
            onClick={() => setSummaryText(null)}
            className="absolute top-2 right-3 text-text-secondary hover:text-text-primary text-xs"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {groups.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-12">
            No activity yet. Spawn some agents to see events here.
          </div>
        )}

        {groups.map((group, gi) => (
          <div key={gi}>
            <div className="sticky top-0 bg-bg/90 backdrop-blur-sm py-1 text-[10px] font-bold text-text-secondary tracking-wider uppercase border-b border-border/50 mb-1 z-10">
              {group.label}
            </div>
            {group.entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => onSelectAgent(entry.agentId)}
                className="w-full text-left flex items-start gap-2 py-1.5 px-2 rounded hover:bg-surface/50 transition-colors group"
              >
                {/* Kind icon */}
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-surface border border-border ${KIND_COLORS[entry.kind]}`}
                >
                  {KIND_ICONS[entry.kind]}
                </span>

                {/* Time */}
                <span className="flex-shrink-0 text-[10px] text-text-secondary font-mono w-16 pt-0.5">
                  {formatTime(entry.timestamp)}
                </span>

                {/* Agent name badge */}
                <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent truncate max-w-[100px]">
                  {entry.agentName}
                </span>

                {/* Summary */}
                <span className="text-xs text-text-primary truncate flex-1 pt-0.5 group-hover:text-accent transition-colors">
                  {entry.summary}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
