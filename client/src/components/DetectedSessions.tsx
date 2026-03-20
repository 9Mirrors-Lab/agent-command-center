import { useState, useEffect } from "react";
import { getServerUrl } from "../hooks/useBus";

interface DetectedSession {
  pid: number;
  tty: string;
  cwd: string;
  sessionId: string;
  lastActive: number;
  recentMessages: string[];
}

interface Props {
  onDismiss: () => void;
}

export default function DetectedSessions({ onDismiss }: Props) {
  const [sessions, setSessions] = useState<DetectedSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${getServerUrl()}/api/sessions/detect`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (sessions.length === 0) return null;

  const relativeTime = (ms: number) => {
    const sec = Math.floor((Date.now() - ms) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  };

  return (
    <div className="mx-4 mt-3 bg-surface border border-accent/30 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-bold text-text-primary">
            {sessions.length} running Claude session{sessions.length !== 1 ? "s" : ""} detected
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          Dismiss
        </button>
      </div>

      <div className="divide-y divide-border">
        {sessions.map((session) => (
          <div key={session.pid} className="px-4 py-2.5 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-text-primary">
                  PID {session.pid}
                </span>
                <span className="text-[10px] text-text-secondary">
                  {session.tty}
                </span>
                <span className="text-[10px] text-text-secondary">
                  {session.cwd}
                </span>
                {session.lastActive > 0 && (
                  <span className="text-[10px] text-accent">
                    {relativeTime(session.lastActive)}
                  </span>
                )}
              </div>
              {session.recentMessages.length > 0 && (
                <p className="text-[11px] text-text-secondary truncate">
                  {session.recentMessages[session.recentMessages.length - 1]}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
