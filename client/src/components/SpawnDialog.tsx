import type { SpawnConfig, RuntimeType, MachineConfig } from "@acc/shared";
import { RUNTIME_INFO } from "@acc/shared";
import { useState, useEffect } from "react";

interface Props {
  onSpawn: (config: SpawnConfig) => Promise<any>;
  onClose: () => void;
}

export default function SpawnDialog({ onSpawn, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [workDir, setWorkDir] = useState("~");
  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState<RuntimeType>("claude");
  const [model, setModel] = useState<"opus" | "sonnet" | "haiku">("sonnet");
  const [budget, setBudget] = useState("");
  const [role, setRole] = useState<"standalone" | "coordinator">("standalone");
  const [machine, setMachine] = useState("local");
  const [machines, setMachines] = useState<MachineConfig[]>([{ name: "local" }]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/machines")
      .then((r) => r.json())
      .then((data) => {
        if (data.machines?.length) setMachines(data.machines);
      })
      .catch(() => {});
  }, []);

  const info = RUNTIME_INFO[runtime];
  const isClaude = runtime === "claude";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setSubmitting(true);
    try {
      await onSpawn({
        prompt: prompt.trim(),
        workDir: workDir.trim() || "~",
        name: name.trim() || undefined,
        runtime,
        model: isClaude ? model : undefined,
        budget: isClaude && budget ? Number(budget) : undefined,
        role: isClaude ? role : undefined,
        machine: machine !== "local" ? machine : undefined,
      });
      onClose();
    } catch (err) {
      console.error("Spawn failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-[520px] max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold">Spawn Agent</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-sm">x</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Runtime selector */}
          <Field label="Runtime">
            <div className="flex gap-1">
              {(Object.entries(RUNTIME_INFO) as [RuntimeType, typeof info][]).map(([key, rt]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRuntime(key)}
                  className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
                    runtime === key
                      ? "bg-accent text-bg font-medium"
                      : "bg-bg border border-border text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {rt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Prompt *">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should this agent do?"
              rows={3}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text-primary outline-none focus:border-accent resize-none"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Working Directory">
              <input
                value={workDir}
                onChange={(e) => setWorkDir(e.target.value)}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
              />
            </Field>
            <Field label="Agent Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Auto-generated"
                className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text-primary outline-none focus:border-accent placeholder:text-text-secondary"
              />
            </Field>
          </div>

          {/* Machine selector (if more than just local) */}
          {machines.length > 1 && (
            <Field label="Machine">
              <select
                value={machine}
                onChange={(e) => setMachine(e.target.value)}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
              >
                {machines.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}{m.host ? ` (${m.host})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Claude-specific options */}
          {isClaude && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Model">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value as any)}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                  >
                    <option value="sonnet">Sonnet</option>
                    <option value="opus">Opus</option>
                    <option value="haiku">Haiku</option>
                  </select>
                </Field>
                <Field label="Budget (USD)">
                  <input
                    type="number"
                    step="0.1"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="No limit"
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text-primary outline-none focus:border-accent placeholder:text-text-secondary"
                  />
                </Field>
                <Field label="Role">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                  >
                    <option value="standalone">Standalone</option>
                    <option value="coordinator">Coordinator</option>
                  </select>
                </Field>
              </div>
            </>
          )}

          {!isClaude && (
            <div className="text-xs text-text-secondary bg-bg rounded px-3 py-2 border border-border">
              {info.isMultiTurn ? "Multi-turn" : "One-shot"} mode. Model and budget options are Claude-specific.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!prompt.trim() || submitting}
              className="px-4 py-2 text-xs bg-accent text-bg rounded font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Spawning..." : "Spawn"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  );
}
