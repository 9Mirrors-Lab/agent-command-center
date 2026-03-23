import type { McpTool } from "@acc/shared";
import { useState, useEffect } from "react";
import { getServerUrl } from "../hooks/useBus";

interface Props {
  visible: boolean;
}

const groupLabels: Record<string, string> = {
  fast: "Fast Tools",
  action: "Action Tools",
  "self-improvement": "Self-Improvement",
};

export default function McpToolsPanel({ visible }: Props) {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState<Record<string, { data: any; loading: boolean; error?: string }>>({});

  useEffect(() => {
    if (!visible) return;
    fetch(`${getServerUrl()}/api/mcp/tools`)
      .then((r) => r.json())
      .then((data) => setTools(data.tools ?? []))
      .catch(() => {});
  }, [visible]);

  if (!visible || tools.length === 0) return null;

  const callTool = async (name: string) => {
    setResults((r) => ({ ...r, [name]: { data: null, loading: true } }));
    try {
      const res = await fetch(`${getServerUrl()}/api/mcp/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: name }),
      });
      const data = await res.json();
      setResults((r) => ({ ...r, [name]: { data: data.data ?? data.error, loading: false } }));
    } catch (err: any) {
      setResults((r) => ({ ...r, [name]: { data: null, loading: false, error: err.message } }));
    }
  };

  const grouped = tools.reduce<Record<string, McpTool[]>>((acc, t) => {
    (acc[t.group] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="mx-4 mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary mb-1"
      >
        <span>{expanded ? "v" : ">"}</span>
        <span className="font-medium">MCP Tools ({tools.length})</span>
      </button>

      {expanded && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          {Object.entries(grouped).map(([group, groupTools]) => (
            <div key={group}>
              <div className="px-3 py-1.5 bg-bg text-[10px] text-text-secondary uppercase tracking-wide border-b border-border">
                {groupLabels[group] ?? group}
              </div>
              <div className="divide-y divide-border">
                {groupTools.map((tool) => {
                  const result = results[tool.name];
                  return (
                    <div key={tool.name} className="px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-medium text-text-primary">{tool.name}</span>
                          <span className="text-[10px] text-text-secondary ml-2">{tool.description}</span>
                        </div>
                        <button
                          onClick={() => callTool(tool.name)}
                          disabled={result?.loading}
                          className="text-[10px] px-2 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50"
                        >
                          {result?.loading ? "..." : "Run"}
                        </button>
                      </div>
                      {result && !result.loading && (
                        <pre className="mt-1 text-[10px] text-text-secondary bg-bg rounded p-2 max-h-[150px] overflow-auto whitespace-pre-wrap">
                          {result.error
                            ? `Error: ${result.error}`
                            : typeof result.data === "string"
                              ? result.data
                              : JSON.stringify(result.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
