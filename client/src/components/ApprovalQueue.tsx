import { useEffect, useRef, useState } from "react";
import type { AgentState, PendingApproval, ApprovalType } from "@acc/shared";

interface Props {
  approvals: PendingApproval[];
  agents: Map<string, AgentState>;
  onAccept: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
  onAcceptAll: () => void;
}

const typeBadge: Record<ApprovalType, { label: string; bg: string; text: string }> = {
  plan: { label: "Plan", bg: "bg-accent/20", text: "text-accent" },
  continue: { label: "Continue", bg: "bg-success/20", text: "text-success" },
  permission: { label: "Permission", bg: "bg-warning/20", text: "text-warning" },
  confirm: { label: "Confirm", bg: "bg-accent/20", text: "text-accent" },
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function ApprovalQueue({ approvals, agents, onAccept, onReject, onAcceptAll }: Props) {
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(approvals.length);

  // Pulse animation when new approvals arrive
  useEffect(() => {
    if (approvals.length > prevCount.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 1500);
      return () => clearTimeout(timer);
    }
    prevCount.current = approvals.length;
  }, [approvals.length]);

  // Keep time-ago labels fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(iv);
  }, []);

  const pending = approvals.filter((a) => !a.resolved);
  if (pending.length === 0) return null;

  return (
    <div
      className={`px-4 py-3 bg-surface border-b border-border transition-all ${
        pulse ? "ring-2 ring-warning/60 ring-inset" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning" />
          </span>
          <span className="text-xs font-bold text-warning uppercase tracking-wide">
            {pending.length} agent{pending.length !== 1 ? "s" : ""} waiting for approval
          </span>
        </div>
        {pending.length > 1 && (
          <button
            onClick={onAcceptAll}
            className="text-xs font-medium px-3 py-1 rounded bg-success/20 text-success hover:bg-success/30 transition-colors"
          >
            Accept All ({pending.length})
          </button>
        )}
      </div>

      {/* Approval cards */}
      <div className="flex flex-wrap gap-2">
        {pending.map((approval) => {
          const agent = agents.get(approval.agentId);
          const agentName = agent?.name ?? `Agent ${approval.agentId.slice(0, 6)}`;
          const badge = typeBadge[approval.type];

          return (
            <div
              key={approval.id}
              className="flex items-center gap-3 bg-bg rounded px-3 py-2 border border-border min-w-0 max-w-md"
            >
              {/* Agent + type */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-text-primary truncate">
                    {agentName}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text} uppercase`}>
                    {badge.label}
                  </span>
                  <span className="text-[10px] text-text-secondary">{timeAgo(approval.createdAt)}</span>
                </div>
                <div className="text-xs text-text-secondary truncate" title={approval.detail}>
                  {approval.title}
                  {approval.detail ? ` — ${approval.detail}` : ""}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onAccept(approval.id)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded bg-success/20 text-success hover:bg-success/30 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => onReject(approval.id)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
