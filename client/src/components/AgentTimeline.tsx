import type { TimelineEvent, TimelineEventKind } from "@acc/shared";
import { useState, useRef, useEffect } from "react";

interface Props {
  timeline: TimelineEvent[];
}

const kindConfig: Record<TimelineEventKind, { icon: string; color: string; dotColor: string }> = {
  "task-start":        { icon: ">", color: "text-accent",         dotColor: "bg-accent" },
  "phase-change":      { icon: "~", color: "text-text-primary",   dotColor: "bg-text-primary" },
  "tool-batch":        { icon: "+", color: "text-text-secondary", dotColor: "bg-text-secondary" },
  "decision":          { icon: "!", color: "text-warning",        dotColor: "bg-warning" },
  "error":             { icon: "x", color: "text-error",          dotColor: "bg-error" },
  "approval-requested":{ icon: "?", color: "text-warning",        dotColor: "bg-warning" },
  "approval-resolved": { icon: "\u2713", color: "text-success",   dotColor: "bg-success" },
  "idle":              { icon: "\u00b7", color: "text-text-secondary opacity-50", dotColor: "bg-text-secondary opacity-50" },
};

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 1000) return "now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export default function AgentTimeline({ timeline }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timeline.length]);

  const toggleExpand = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const isExpandable = (kind: TimelineEventKind) =>
    kind === "tool-batch" || kind === "phase-change" || kind === "decision";

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-secondary">
        No timeline events yet
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto p-3">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />

        {timeline.map((event, i) => {
          const config = kindConfig[event.kind];
          const isOpen = expanded.has(i);
          const canExpand = isExpandable(event.kind) && event.detail;
          const isPulse = event.kind === "approval-requested";

          return (
            <div
              key={i}
              className={`relative flex items-start gap-2.5 mb-1 pl-5 group ${canExpand ? "cursor-pointer" : ""}`}
              onClick={canExpand ? () => toggleExpand(i) : undefined}
            >
              {/* Dot on the timeline */}
              <div
                className={`absolute left-[4px] top-[5px] w-[7px] h-[7px] rounded-full ${config.dotColor} ${
                  isPulse ? "animate-pulse ring-2 ring-warning/40" : ""
                }`}
              />

              {/* Icon */}
              <span className={`text-xs font-mono w-3 shrink-0 ${config.color}`}>
                {config.icon}
              </span>

              {/* Summary + time */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xs truncate ${
                    event.kind === "phase-change" ? "text-text-primary font-medium" :
                    event.kind === "idle" ? "text-text-secondary opacity-50" :
                    "text-text-primary"
                  }`}>
                    {event.summary}
                  </span>
                  <span className="text-[10px] text-text-secondary shrink-0 opacity-60">
                    {relativeTime(event.timestamp)}
                  </span>
                </div>

                {/* Expanded detail */}
                {isOpen && event.detail && (
                  <div className="mt-1 mb-1 text-xs text-text-secondary whitespace-pre-wrap bg-bg rounded px-2 py-1.5 border border-border">
                    {event.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact breadcrumb trail for AgentCard — shows last N events as inline text */
export function TimelineBreadcrumb({ timeline, max = 3 }: { timeline: TimelineEvent[]; max?: number }) {
  if (!timeline || timeline.length === 0) return null;

  const recent = timeline.slice(-max);
  const parts = recent.map((e) => {
    const cfg = kindConfig[e.kind];
    const label = e.summary.length > 30 ? e.summary.slice(0, 30) + "\u2026" : e.summary;
    return `${cfg.icon} ${label}`;
  });

  return (
    <div className="text-[10px] text-text-secondary truncate mb-2 font-mono opacity-70">
      {parts.join(" \u2192 ")}
    </div>
  );
}
