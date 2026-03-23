import type { Learning, LearningCategory } from "@acc/shared";
import { useState } from "react";
import { getServerUrl } from "../hooks/useBus";

interface Props {
  learnings: Learning[];
  onAdd: (learning: { title: string; detail: string; category: LearningCategory }) => void;
}

const categoryColors: Record<LearningCategory, string> = {
  pattern: "bg-accent/20 text-accent",
  mistake: "bg-error/20 text-error",
  optimization: "bg-success/20 text-success",
  insight: "bg-warning/20 text-warning",
};

const categoryLabels: Record<LearningCategory, string> = {
  pattern: "Pattern",
  mistake: "Mistake",
  optimization: "Optimization",
  insight: "Insight",
};

const sourceLabels: Record<string, string> = {
  reflect: "Reflect",
  observer: "Observer",
  manager: "Manager",
  user: "Manual",
};

export default function LearningsPanel({ learnings, onAdd }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [category, setCategory] = useState<LearningCategory>("insight");

  if (learnings.length === 0 && !showForm) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !detail.trim()) return;
    onAdd({ title: title.trim(), detail: detail.trim(), category });
    setTitle("");
    setDetail("");
    setShowForm(false);
  };

  const sorted = [...learnings].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="mx-4 mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary mb-1"
      >
        <span>{expanded ? "v" : ">"}</span>
        <span className="font-medium">Learnings ({learnings.length})</span>
      </button>

      {expanded && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-[10px] text-text-secondary uppercase tracking-wide">
              Persistent insights from agent sessions
            </span>
            <button
              onClick={() => setShowForm(!showForm)}
              className="text-[10px] px-2 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30"
            >
              + Add
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="px-3 py-2 border-b border-border space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Learning title"
                className="w-full bg-bg border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                autoFocus
              />
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Detail..."
                rows={2}
                className="w-full bg-bg border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent resize-none"
              />
              <div className="flex items-center gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as LearningCategory)}
                  className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-primary"
                >
                  <option value="insight">Insight</option>
                  <option value="pattern">Pattern</option>
                  <option value="mistake">Mistake</option>
                  <option value="optimization">Optimization</option>
                </select>
                <button type="submit" className="text-xs px-3 py-1 bg-accent text-bg rounded">Save</button>
                <button type="button" onClick={() => setShowForm(false)} className="text-xs text-text-secondary">Cancel</button>
              </div>
            </form>
          )}

          <div className="max-h-[200px] overflow-auto divide-y divide-border">
            {sorted.map((l) => (
              <div key={l.id} className="px-3 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${categoryColors[l.category]}`}>
                    {categoryLabels[l.category]}
                  </span>
                  <span className="text-[10px] text-text-secondary">
                    {sourceLabels[l.source] ?? l.source}
                  </span>
                  <span className="text-[10px] text-text-secondary">
                    {Math.round(l.confidence * 100)}% conf
                  </span>
                </div>
                <p className="text-xs font-medium text-text-primary">{l.title}</p>
                <p className="text-[11px] text-text-secondary line-clamp-2">{l.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
