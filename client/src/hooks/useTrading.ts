import { useState, useEffect, useCallback } from "react";
import { getServerUrl } from "./useBus";

interface TradingState {
  available: boolean;
  loading: boolean;
  account: any | null;
  status: any | null;
  journal: any | null;
  strategies: any | null;
  apex: any | null;
}

export function useTrading(enabled: boolean) {
  const [state, setState] = useState<TradingState>({
    available: false,
    loading: true,
    account: null,
    status: null,
    journal: null,
    strategies: null,
    apex: null,
  });

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    const base = getServerUrl();

    try {
      const availRes = await fetch(`${base}/api/trading/available`);
      const { available } = await availRes.json();

      if (!available) {
        setState((s) => ({ ...s, available: false, loading: false }));
        return;
      }

      // Fetch all trading data in parallel
      const [accountRes, statusRes, journalRes, strategiesRes, apexRes] = await Promise.allSettled([
        fetch(`${base}/api/trading/account`).then((r) => r.json()),
        fetch(`${base}/api/trading/status`).then((r) => r.json()),
        fetch(`${base}/api/trading/journal`).then((r) => r.json()),
        fetch(`${base}/api/trading/strategies`).then((r) => r.json()),
        fetch(`${base}/api/trading/apex`).then((r) => r.json()),
      ]);

      setState({
        available: true,
        loading: false,
        account: accountRes.status === "fulfilled" ? accountRes.value.data : null,
        status: statusRes.status === "fulfilled" ? statusRes.value.data : null,
        journal: journalRes.status === "fulfilled" ? journalRes.value.data : null,
        strategies: strategiesRes.status === "fulfilled" ? strategiesRes.value.data : null,
        apex: apexRes.status === "fulfilled" ? apexRes.value.data : null,
      });
    } catch {
      setState((s) => ({ ...s, available: false, loading: false }));
    }
  }, [enabled]);

  // Initial fetch + poll every 10s
  useEffect(() => {
    if (!enabled) return;
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [enabled, fetchData]);

  const runStrategy = useCallback(async (name: string, args?: Record<string, any>) => {
    const base = getServerUrl();
    await fetch(`${base}/api/trading/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy: name, ...args }),
    });
  }, []);

  const triggerReflect = useCallback(async () => {
    const base = getServerUrl();
    await fetch(`${base}/api/trading/reflect`, { method: "POST" });
  }, []);

  return { ...state, runStrategy, triggerReflect, refresh: fetchData };
}
