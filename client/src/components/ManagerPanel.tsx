import type { AgentSummary } from "@acc/shared";

interface Props {
  summary: string;
  assessments: AgentSummary[];
  alerts: Array<{ agentId: string; alert: string; severity: string; timestamp: number }>;
}

const severityColors: Record<string, string> = {
  info: "text-accent",
  warn: "text-warning",
  error: "text-error",
};

const assessmentColors: Record<string, string> = {
  "on-track": "text-success",
  stalled: "text-warning",
  "needs-attention": "text-warning",
  done: "text-text-secondary",
  errored: "text-error",
};

export default function ManagerPanel({ summary, assessments, alerts }: Props) {
  const recentAlerts = alerts.slice(-3);

  return (
    <div className="px-4 py-2 bg-surface border-b border-border">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-accent">MANAGER</span>
        <span className="text-xs text-text-primary">{summary}</span>
      </div>

      {recentAlerts.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {recentAlerts.map((a, i) => (
            <span key={i} className={severityColors[a.severity] ?? "text-text-secondary"}>
              {a.severity === "error" ? "!!!" : a.severity === "warn" ? "!!" : "i"} {a.alert}
            </span>
          ))}
        </div>
      )}

      {assessments.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-1 text-xs">
          {assessments.map((a) => (
            <span key={a.agentId} className="flex items-center gap-1">
              <span className={assessmentColors[a.assessment] ?? "text-text-secondary"}>
                {a.assessment}
              </span>
              <span className="text-text-secondary">{a.note}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
