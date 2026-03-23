import { useState } from "react";
import { useTrading } from "../hooks/useTrading";

interface Props {
  enabled: boolean;
}

type Tab = "account" | "positions" | "journal" | "strategies";

export default function TradingPanel({ enabled }: Props) {
  const trading = useTrading(enabled);
  const [tab, setTab] = useState<Tab>("account");

  if (!enabled) return null;

  if (trading.loading) {
    return (
      <div className="mx-4 mt-2 bg-surface border border-border rounded-lg p-4 text-xs text-text-secondary">
        Loading trading data...
      </div>
    );
  }

  if (!trading.available) {
    return (
      <div className="mx-4 mt-2 bg-surface border border-border rounded-lg p-4">
        <p className="text-xs text-text-secondary">
          Agent CLI not connected. Run <code className="text-accent">hl mcp serve</code> to enable trading panels.
        </p>
      </div>
    );
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`text-[10px] px-2 py-1 rounded ${
        tab === t ? "bg-accent/20 text-accent" : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-4 mt-2 bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          {tabBtn("account", "Account")}
          {tabBtn("positions", "Positions")}
          {tabBtn("journal", "Journal")}
          {tabBtn("strategies", "Strategies")}
        </div>
        <button
          onClick={trading.refresh}
          className="text-[10px] text-text-secondary hover:text-text-primary"
        >
          Refresh
        </button>
      </div>

      <div className="p-3 max-h-[300px] overflow-auto">
        {tab === "account" && <AccountView data={trading.account} />}
        {tab === "positions" && <PositionsView data={trading.status} />}
        {tab === "journal" && <JournalView data={trading.journal} />}
        {tab === "strategies" && (
          <StrategiesView
            data={trading.strategies}
            apex={trading.apex}
            onRun={trading.runStrategy}
            onReflect={trading.triggerReflect}
          />
        )}
      </div>
    </div>
  );
}

function AccountView({ data }: { data: any }) {
  if (!data) return <Empty />;

  // Agent CLI returns varying formats — handle gracefully
  const equity = data.equity ?? data.accountValue ?? data.account_value;
  const balance = data.balance ?? data.withdrawable;
  const upnl = data.unrealizedPnl ?? data.unrealized_pnl ?? data.upnl;
  const margin = data.margin ?? data.margin_used;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Equity" value={fmt(equity)} />
        <Stat label="Balance" value={fmt(balance)} />
        <Stat label="Unrealized P&L" value={fmt(upnl)} color={upnl > 0 ? "text-success" : upnl < 0 ? "text-error" : undefined} />
        <Stat label="Margin" value={fmt(margin)} />
      </div>
      {data.raw && <pre className="text-[10px] text-text-secondary mt-2 whitespace-pre-wrap">{typeof data.raw === "string" ? data.raw : JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

function PositionsView({ data }: { data: any }) {
  if (!data) return <Empty />;

  // Try to extract positions array
  const positions = Array.isArray(data) ? data
    : Array.isArray(data.positions) ? data.positions
    : data.raw ? [] : [];

  if (positions.length === 0) {
    return (
      <div>
        <p className="text-xs text-text-secondary">No open positions</p>
        {data.raw && <pre className="text-[10px] text-text-secondary mt-2 whitespace-pre-wrap">{data.raw}</pre>}
      </div>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-text-secondary text-left">
          <th className="pb-1">Symbol</th>
          <th className="pb-1">Side</th>
          <th className="pb-1">Size</th>
          <th className="pb-1">Entry</th>
          <th className="pb-1">P&L</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p: any, i: number) => (
          <tr key={i} className="border-t border-border">
            <td className="py-1 font-medium">{p.symbol ?? p.coin}</td>
            <td className={p.side === "long" || p.szi > 0 ? "text-success" : "text-error"}>{p.side ?? (p.szi > 0 ? "long" : "short")}</td>
            <td>{Math.abs(p.size ?? p.szi ?? 0)}</td>
            <td>{fmt(p.entryPrice ?? p.entryPx)}</td>
            <td className={pnlColor(p.unrealizedPnl ?? p.upnl)}>{fmt(p.unrealizedPnl ?? p.upnl)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function JournalView({ data }: { data: any }) {
  if (!data) return <Empty />;

  const entries = Array.isArray(data) ? data : data.trades ?? data.entries ?? [];

  if (entries.length === 0) {
    return (
      <div>
        <p className="text-xs text-text-secondary">No recent trades</p>
        {data.raw && <pre className="text-[10px] text-text-secondary mt-2 whitespace-pre-wrap">{data.raw}</pre>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.slice(0, 20).map((e: any, i: number) => (
        <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="font-medium">{e.symbol ?? e.coin}</span>
            <span className={e.side === "buy" ? "text-success" : "text-error"}>{e.side}</span>
            <span className="text-text-secondary">{e.size ?? e.sz}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">{e.strategy}</span>
            {e.pnl !== undefined && <span className={pnlColor(e.pnl)}>{fmt(e.pnl)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function StrategiesView({ data, apex, onRun, onReflect }: { data: any; apex: any; onRun: (name: string) => void; onReflect: () => void }) {
  if (!data) return <Empty />;

  const strategies = data.strategies ? Object.entries(data.strategies) : [];

  return (
    <div className="space-y-3">
      {apex && (
        <div className="bg-bg rounded border border-border p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-accent">APEX Status</span>
          </div>
          <pre className="text-[10px] text-text-secondary whitespace-pre-wrap">
            {typeof apex === "string" ? apex : typeof apex.raw === "string" ? apex.raw : JSON.stringify(apex, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onReflect}
          className="text-[10px] px-2 py-1 rounded bg-warning/20 text-warning hover:bg-warning/30"
        >
          Trigger REFLECT
        </button>
      </div>

      {strategies.map(([name, info]: [string, any]) => (
        <div key={name} className="flex items-center justify-between py-1 border-b border-border">
          <div>
            <span className="text-xs font-medium">{name}</span>
            <span className="text-[10px] text-text-secondary ml-2">{info.description?.slice(0, 60)}</span>
          </div>
          <button
            onClick={() => onRun(name)}
            className="text-[10px] px-2 py-0.5 rounded bg-success/20 text-success hover:bg-success/30"
          >
            Run
          </button>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] text-text-secondary">{label}</div>
      <div className={`text-sm font-medium ${color ?? "text-text-primary"}`}>{value}</div>
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-text-secondary">No data available</p>;
}

function fmt(n: any): string {
  if (n === null || n === undefined) return "-";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return num >= 0 ? `$${num.toFixed(2)}` : `-$${Math.abs(num).toFixed(2)}`;
}

function pnlColor(n: any): string {
  const num = Number(n);
  if (isNaN(num) || num === 0) return "text-text-secondary";
  return num > 0 ? "text-success" : "text-error";
}
