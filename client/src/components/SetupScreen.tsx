import { useState } from "react";
import { getServerUrl, setServerUrl, markConfigured } from "../hooks/useBus";

interface Props {
  onComplete: () => void;
  isReconfigure?: boolean;
}

export default function SetupScreen({ onComplete, isReconfigure }: Props) {
  const [url, setUrl] = useState(getServerUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setErrorMsg("");

    try {
      const normalized = url.replace(/\/+$/, "");
      const res = await fetch(`${normalized}/api/agents`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.agents !== undefined) {
        setTestResult("success");
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (err: any) {
      setTestResult("error");
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        setErrorMsg("Connection timed out. Is the server running?");
      } else if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setErrorMsg("Cannot reach server. Make sure it's running and CORS is enabled.");
      } else {
        setErrorMsg(err.message || "Connection failed");
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    setServerUrl(url);
    markConfigured();
    onComplete();
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-md mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Agent Command Center
          </h1>
          <p className="text-sm text-text-secondary">
            {isReconfigure
              ? "Update your server connection settings."
              : "Connect to your local ACC server to get started."}
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-lg p-6 space-y-5">
          {/* Step 1: Start server */}
          {!isReconfigure && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wide">
                1. Start the server
              </h2>
              <div className="bg-bg rounded border border-border p-3">
                <code className="text-xs text-accent">
                  cd agent-command-center && bun run dev:server
                </code>
              </div>
              <p className="text-[11px] text-text-secondary">
                The server spawns AI agents locally. It needs access to your CLI tools (claude, codex, etc).
              </p>
            </div>
          )}

          {/* Step 2: Server URL */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-wide">
              {isReconfigure ? "Server URL" : "2. Connect to server"}
            </h2>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTestResult(null);
                }}
                placeholder="http://localhost:4200"
                className="flex-1 bg-bg border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
              <button
                onClick={testConnection}
                disabled={testing || !url.trim()}
                className="px-4 py-2 text-xs bg-bg border border-border rounded text-text-secondary hover:text-text-primary hover:border-accent transition-colors disabled:opacity-50"
              >
                {testing ? "Testing..." : "Test"}
              </button>
            </div>

            {/* Test result */}
            {testResult === "success" && (
              <div className="flex items-center gap-2 text-xs text-success">
                <span className="w-2 h-2 rounded-full bg-success" />
                Connected successfully
              </div>
            )}
            {testResult === "error" && (
              <div className="text-xs text-error">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error" />
                  {errorMsg}
                </span>
              </div>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={testResult !== "success"}
            className="w-full py-2.5 text-sm bg-accent text-bg rounded font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            {isReconfigure ? "Save & Reconnect" : "Get Started"}
          </button>

          {isReconfigure && (
            <button
              onClick={onComplete}
              className="w-full py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Footer */}
        {!isReconfigure && (
          <p className="text-center text-[11px] text-text-secondary mt-4">
            The dashboard connects to your local server via WebSocket.
            <br />
            Your API keys and agent processes stay on your machine.
          </p>
        )}
      </div>
    </div>
  );
}
