import type { AgentStatus } from "@acc/shared";

const colors: Record<AgentStatus, string> = {
  active: "bg-success shadow-[0_0_6px_rgba(63,185,80,0.4)]",
  idle: "bg-warning",
  stopped: "bg-text-secondary",
  errored: "bg-error shadow-[0_0_6px_rgba(248,81,73,0.4)]",
};

const pulseStatuses = new Set<AgentStatus>(["active"]);

interface Props {
  status: AgentStatus;
  size?: "sm" | "md";
}

export default function StatusDot({ status, size = "sm" }: Props) {
  const sizeClass = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  const pulse = pulseStatuses.has(status) ? "animate-pulse" : "";

  return (
    <span
      className={`inline-block rounded-full ${sizeClass} ${colors[status]} ${pulse}`}
      title={status}
    />
  );
}
