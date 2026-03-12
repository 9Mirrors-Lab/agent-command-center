import type { AgentState } from "@acc/shared";
import { formatTokens, formatCost, formatDuration } from "../lib/format";
import { useState, useRef, useEffect } from "react";
import { useTick } from "../hooks/useTick";
import TerminalPanel from "./TerminalPanel";
import AgentTimeline from "./AgentTimeline";

type RightPane = "timeline" | "tools" | "terminal";

interface Props {
  agent: AgentState;
  onClose: () => void;
  onPrompt: (prompt: string) => void;
  onStop: () => void;
  onResume: () => void;
}

export default function AgentDetail({ agent, onClose, onPrompt, onStop, onResume }: Props) {
  useTick(1000);
  const [prompt, setPrompt] = useState("");
  const [rightPane, setRightPane] = useState<RightPane>("timeline");
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [agent.outputLines.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onPrompt(prompt);
    setPrompt("");
  };

  const paneButton = (pane: RightPane, label: string) => (
    <button
      onClick={() => setRightPane(rightPane === pane ? "timeline" : pane)}
      className={`text-xs px-2 py-1 rounded ${
        rightPane === pane
          ? "bg-accent/20 text-accent"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="border-t border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{agent.name}</span>
          <span className="text-xs text-text-secondary">{agent.config.model ?? "sonnet"}</span>
          <span className="text-xs text-text-secondary">
            {formatTokens(agent.tokens.input)}in / {formatTokens(agent.tokens.output)}out
          </span>
          <span className="text-xs text-text-secondary">{formatCost(agent.cost)}</span>
          <span className="text-xs text-text-secondary">{formatDuration(Date.now() - agent.startTime)}</span>
        </div>
        <div className="flex items-center gap-2">
          {(agent.status === "active" || agent.status === "idle") && (
            <button onClick={onStop} className="text-xs px-2 py-1 rounded bg-error/20 text-error hover:bg-error/30">
              Stop
            </button>
          )}
          {(agent.status === "stopped" || agent.status === "errored") && (
            <button onClick={onResume} className="text-xs px-2 py-1 rounded bg-success/20 text-success hover:bg-success/30">
              Resume
            </button>
          )}
          {paneButton("timeline", "Timeline")}
          {paneButton("tools", "Tools")}
          {paneButton("terminal", "Terminal")}
          <button onClick={onClose} className="text-xs px-2 py-1 rounded text-text-secondary hover:text-text-primary">
            Close
          </button>
        </div>
      </div>

      {/* Content: Output + Right Pane */}
      <div className="flex" style={{ height: "300px" }}>
        {/* Output stream */}
        <div className="flex-1 flex flex-col">
          <div ref={outputRef} className="flex-1 overflow-auto p-3 text-xs whitespace-pre-wrap font-mono">
            {agent.outputLines.length === 0 ? (
              <span className="text-text-secondary">Waiting for output...</span>
            ) : (
              agent.outputLines.map((line, i) => (
                <div key={i} className="text-text-primary leading-relaxed">{line}</div>
              ))
            )}
          </div>

          {/* Prompt input */}
          <form onSubmit={handleSubmit} className="flex border-t border-border">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Message ${agent.name}...`}
              className="flex-1 bg-bg px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-secondary"
            />
            <button
              type="submit"
              className="px-4 py-2 text-xs bg-accent text-bg font-medium hover:opacity-90 transition-opacity"
            >
              Send
            </button>
          </form>
        </div>

        {/* Right pane */}
        {rightPane === "terminal" ? (
          <div className="w-[480px] border-l border-border">
            <TerminalPanel agentId={agent.id} workDir={agent.config.workDir} />
          </div>
        ) : rightPane === "timeline" ? (
          <div className="w-72 border-l border-border">
            <div className="px-3 pt-2 pb-1">
              <div className="text-xs font-bold text-text-secondary">TIMELINE</div>
            </div>
            <div style={{ height: "calc(100% - 28px)" }}>
              <AgentTimeline timeline={agent.timeline ?? []} />
            </div>
          </div>
        ) : (
          <div className="w-64 border-l border-border overflow-auto p-3">
            <div className="text-xs font-bold text-text-secondary mb-2">TOOLS</div>
            {agent.recentTools.slice(-10).reverse().map((tool, i) => (
              <div key={i} className="text-xs mb-1.5 flex items-start gap-1.5">
                <span className={
                  tool.status === "running" ? "text-accent" :
                  tool.status === "completed" ? "text-success" : "text-error"
                }>
                  {tool.status === "running" ? ">" : tool.status === "completed" ? "+" : "!"}
                </span>
                <div>
                  <span className="text-text-primary">{tool.tool}</span>
                  {tool.target && (
                    <span className="text-text-secondary ml-1 truncate block max-w-[180px]">{tool.target}</span>
                  )}
                </div>
              </div>
            ))}
            {agent.recentTools.length === 0 && (
              <span className="text-text-secondary text-xs">No tools used yet</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
