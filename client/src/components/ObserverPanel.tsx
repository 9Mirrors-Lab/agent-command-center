import { useState, useEffect, useRef } from "react";
import type { AgentState, ObserverSuggestion, SuggestionAction } from "@acc/shared";

interface Props {
  suggestions: ObserverSuggestion[];
  agents: Map<string, AgentState>;
  onApply: (suggestionId: string) => void;
  onDismiss: (suggestionId: string) => void;
}

function actionBadge(action: SuggestionAction) {
  switch (action.action) {
    case "fork-subagent":
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent">
          Fork → {action.model ?? "sonnet"}
        </span>
      );
    case "switch-model":
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-warning/20 text-warning">
          Switch → {action.model}
        </span>
      );
    case "retry-different-approach":
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent">
          Retry
        </span>
      );
    case "stop-agent":
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-error/20 text-error">
          Stop
        </span>
      );
    case "custom":
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-surface-hover text-text-primary">
          {action.label}
        </span>
      );
  }
}

export default function ObserverPanel({ suggestions, agents, onApply, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const prevCountRef = useRef(suggestions.length);

  const pending = suggestions.filter((s) => !s.applied);

  // Auto-expand when new suggestions arrive
  useEffect(() => {
    if (suggestions.length > prevCountRef.current) {
      setExpanded(true);
      // Track new suggestion ids for animation
      const newIds = new Set(
        suggestions
          .slice(prevCountRef.current)
          .map((s) => s.id)
      );
      setAnimatingIds((prev) => new Set([...prev, ...newIds]));
      // Clear animation class after transition
      const timer = setTimeout(() => {
        setAnimatingIds(new Set());
      }, 400);
      prevCountRef.current = suggestions.length;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = suggestions.length;
  }, [suggestions]);

  if (pending.length === 0) return null;

  return (
    <div className="px-4 py-2 bg-surface border-b border-border">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className="text-xs font-bold text-warning">OBSERVER</span>
        <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-warning/20 text-warning min-w-[1.25rem] text-center">
          {pending.length}
        </span>
        <span className="text-xs text-text-secondary ml-auto">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {/* Suggestion cards */}
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {pending.map((suggestion) => {
            const agent = agents.get(suggestion.agentId);
            const agentName = agent?.name ?? suggestion.agentId.slice(0, 8);
            const isAnimating = animatingIds.has(suggestion.id);

            return (
              <div
                key={suggestion.id}
                className={`flex items-start gap-3 px-3 py-2 rounded bg-bg border border-border transition-all duration-300 ${
                  isAnimating ? "animate-slide-in" : ""
                }`}
                style={isAnimating ? { animation: "slideIn 0.3s ease-out" } : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-text-secondary">{agentName}</span>
                    {actionBadge(suggestion.suggestedAction)}
                  </div>
                  <div className="text-xs font-semibold text-text-primary truncate">
                    {suggestion.title}
                  </div>
                  <div className="text-xs text-text-secondary line-clamp-2 mt-0.5">
                    {suggestion.reasoning}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                  <button
                    onClick={() => onApply(suggestion.id)}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-accent text-bg hover:bg-accent/80 transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => onDismiss(suggestion.id)}
                    className="px-2.5 py-1 rounded text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline keyframe for slide-in animation */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
