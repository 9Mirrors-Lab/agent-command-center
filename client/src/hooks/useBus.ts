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
