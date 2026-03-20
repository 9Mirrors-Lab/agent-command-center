import { useEffect, useRef, useState, useCallback } from "react";
import type { BusMessage } from "@acc/shared";

type MessageHandler = (msg: BusMessage | { type: "snapshot"; agents: any[]; stats: any }) => void;

const STORAGE_KEY = "acc:serverUrl";
const DEFAULT_URL = "http://localhost:4200";

/** Get the configured server URL from localStorage */
export function getServerUrl(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
}

/** Set the server URL in localStorage */
export function setServerUrl(url: string): void {
  // Normalize: remove trailing slash
  const normalized = url.replace(/\/+$/, "");
  localStorage.setItem(STORAGE_KEY, normalized);
}

/** Check if ACC has been configured (server URL set) */
export function isConfigured(): boolean {
  return localStorage.getItem("acc:configured") === "true";
}

/** Mark ACC as configured */
export function markConfigured(): void {
  localStorage.setItem("acc:configured", "true");
}

/**
 * Try to auto-configure by detecting if the server is reachable at the
 * current origin (same-host serving) or default localhost:4200.
 * Returns true if auto-configured successfully.
 */
export async function tryAutoConfig(): Promise<boolean> {
  // Already configured
  if (isConfigured()) return true;

  // Try same-origin first (server serves the client at :4200)
  const sameOrigin = window.location.origin;
  // Try Vite dev mode (client on :5173, server on :4200)
  const devUrl = `http://${window.location.hostname}:4200`;
  // Default
  const candidates = [sameOrigin, devUrl, DEFAULT_URL];
  // Deduplicate
  const unique = [...new Set(candidates)];

  for (const url of unique) {
    try {
      const res = await fetch(`${url}/api/agents`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agents !== undefined) {
          setServerUrl(url);
          markConfigured();
          return true;
        }
      }
    } catch {}
  }

  return false;
}

/** Convert HTTP URL to WebSocket URL */
function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws") + "/ws";
}

export function useBus(onMessage: MessageHandler) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const send = useCallback((msg: BusMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!isConfigured()) return;

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectDelay = 1000;

    function connect() {
      const serverUrl = getServerUrl();
      const wsUrl = toWsUrl(serverUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectDelay = 1000;
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimeout = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current(data);
        } catch {
          // ignore malformed
        }
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, []);

  return { connected, send };
}
