import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { AgentState, TimelineEvent } from "@acc/shared";
import { formatDuration } from "../lib/format";

export interface ReplayState {
  enabled: boolean;
  timestamp: number;
  playing: boolean;
}

interface Props {
  agents: AgentState[];
  replayState: ReplayState;
  onReplayChange: React.Dispatch<React.SetStateAction<ReplayState>>;
}

interface TickMark {
  timestamp: number;
  agentId: string;
  agentName: string;
  kind: string;
  color: string;
}

const AGENT_COLORS = [
  "#58a6ff", "#3fb950", "#d29922", "#f85149",
  "#bc8cff", "#79c0ff", "#56d364", "#e3b341",
];

function getAgentColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length];
}

export default function ReplayBar({ agents, replayState, onReplayChange }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; text: string } | null>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute time range
  const timeRange = useMemo(() => {
    const starts = agents.map((a) => a.startTime).filter(Boolean);
    const min = starts.length > 0 ? Math.min(...starts) : Date.now() - 60_000;
    const max = Date.now();
    return { min, max, span: max - min || 1 };
  }, [agents]);

  // Collect all tick marks from agent timelines
  const ticks = useMemo(() => {
    const marks: TickMark[] = [];
    agents.forEach((agent, idx) => {
      const color = getAgentColor(idx);
      for (const event of agent.timeline) {
        marks.push({
          timestamp: event.timestamp,
          agentId: agent.id,
          agentName: agent.name,
          kind: event.kind,
          color,
        });
      }
    });
    return marks.sort((a, b) => a.timestamp - b.timestamp);
  }, [agents]);

  // Position helpers
  const tsToX = useCallback((ts: number): number => {
    return ((ts - timeRange.min) / timeRange.span) * 100;
  }, [timeRange]);

  const xToTs = useCallback((xPercent: number): number => {
    return timeRange.min + (xPercent / 100) * timeRange.span;
  }, [timeRange]);

  // Mouse interaction
  const getXPercent = useCallback((clientX: number): number => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const xPct = getXPercent(e.clientX);
    onReplayChange({ ...replayState, enabled: true, timestamp: xToTs(xPct), playing: false });
  }, [getXPercent, xToTs, replayState, onReplayChange]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const xPct = getXPercent(e.clientX);
      onReplayChange({ ...replayState, enabled: true, timestamp: xToTs(xPct), playing: false });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, getXPercent, xToTs, replayState, onReplayChange]);

  // Play/pause auto-advance (1 tick = 30s real time)
  useEffect(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    if (replayState.playing && replayState.enabled) {
      playIntervalRef.current = setInterval(() => {
        onReplayChange((prev: ReplayState) => {
          const next = prev.timestamp + 30_000;
          if (next >= Date.now()) {
            return { ...prev, playing: false, timestamp: Date.now() };
          }
          return { ...prev, timestamp: next };
        });
      }, 1000);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [replayState.playing, replayState.enabled, onReplayChange]);

  // Handle hover for tooltip
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) return;
    const xPct = getXPercent(e.clientX);
    const ts = xToTs(xPct);
    const d = new Date(ts);
    setHoverInfo({
      x: e.clientX,
      text: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    });
  }, [dragging, getXPercent, xToTs]);

  const playheadX = replayState.enabled ? tsToX(replayState.timestamp) : 100;

  return (
    <div className="h-12 bg-surface border-t border-border flex items-center px-3 gap-2 select-none flex-shrink-0">
      {/* Play/Pause */}
      <button
        onClick={() => {
          if (!replayState.enabled) {
            onReplayChange({ enabled: true, timestamp: timeRange.min, playing: true });
          } else {
            onReplayChange({ ...replayState, playing: !replayState.playing });
          }
        }}
        className="w-6 h-6 flex items-center justify-center rounded bg-bg border border-border text-text-secondary hover:text-text-primary text-xs"
        title={replayState.playing ? "Pause" : "Play"}
      >
        {replayState.playing ? "||" : "\u25B6"}
      </button>

      {/* Exit replay */}
      {replayState.enabled && (
        <button
          onClick={() => onReplayChange({ enabled: false, timestamp: Date.now(), playing: false })}
          className="text-[10px] text-error hover:text-error/80 font-medium"
        >
          Live
        </button>
      )}

      {/* Timeline bar */}
      <div
        ref={barRef}
        className="flex-1 h-6 bg-bg rounded border border-border relative cursor-crosshair overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
      >
        {/* Tick marks */}
        {ticks.map((tick, i) => {
          const x = tsToX(tick.timestamp);
          return (
            <div
              key={i}
              className="absolute bottom-0 w-[2px] rounded-t"
              style={{
                left: `${x}%`,
                height: tick.kind === "error" ? "100%" : "60%",
                backgroundColor: tick.kind === "error" ? "#f85149" : tick.color,
                opacity: 0.7,
              }}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-accent z-10"
          style={{ left: `${playheadX}%` }}
        >
          <div className="absolute -top-0.5 -left-1 w-2 h-2 rounded-full bg-accent" />
        </div>

        {/* Hover tooltip */}
        {hoverInfo && !dragging && (
          <div
            className="absolute -top-7 px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] text-text-primary pointer-events-none z-20 whitespace-nowrap"
            style={{ left: `${getXPercent(hoverInfo.x)}%`, transform: "translateX(-50%)" }}
          >
            {hoverInfo.text}
          </div>
        )}
      </div>

      {/* Time label */}
      <span className="text-[10px] text-text-secondary font-mono w-20 text-right">
        {replayState.enabled
          ? new Date(replayState.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "Live"}
      </span>

      {/* Duration */}
      <span className="text-[10px] text-text-secondary w-16 text-right">
        {formatDuration(timeRange.span)}
      </span>
    </div>
  );
}

// Helper: filter agents to show state at a given replay timestamp
export function getAgentsAtTimestamp(agents: AgentState[], timestamp: number): AgentState[] {
  return agents
    .filter((a) => a.startTime <= timestamp)
    .map((agent) => {
      // Filter timeline to events up to this timestamp
      const timeline = agent.timeline.filter((e) => e.timestamp <= timestamp);
      // Determine status at timestamp
      let status = agent.status;
      if (timestamp < Date.now() - 1000) {
        // Historical: determine from timeline
        const lastEvent = timeline[timeline.length - 1];
        if (lastEvent) {
          if (lastEvent.kind === "idle") status = "idle";
          else if (lastEvent.kind === "error") status = "errored";
          else status = "active";
        }
      }
      // Filter recent tools to those active at timestamp
      const recentTools = agent.recentTools.filter(
        (t) => t.startTime <= timestamp
      );
      return {
        ...agent,
        status,
        timeline,
        recentTools,
        outputLines: agent.outputLines, // Keep full output
      };
    });
}
