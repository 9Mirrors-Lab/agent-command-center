import { useEffect, useRef, useMemo, useCallback } from "react";
import type { AgentState, Learning } from "@acc/shared";

interface Props {
  agents: AgentState[];
  learnings: Learning[];
  selectedId: string | null;
  onSelect: (agentId: string) => void;
}

interface GraphNode {
  id: string;
  label: string;
  type: "agent" | "learning";
  status?: string;
  role?: string;
  tokenSize: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "delegation" | "shared-file" | "learning";
}

const STATUS_COLORS: Record<string, string> = {
  active: "#3fb950",
  idle: "#d29922",
  stopped: "#484f58",
  errored: "#f85149",
};

const ROLE_SHAPES: Record<string, string> = {
  coordinator: "diamond",
  worker: "circle",
  standalone: "circle",
};

export default function WorkspaceGraph({ agents, learnings, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animFrameRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const hoverRef = useRef<string | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  // Build graph data
  const { nodes, edges } = useMemo(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Agent nodes
    for (const agent of agents) {
      const totalTokens = agent.tokens.input + agent.tokens.output;
      nodes.push({
        id: agent.id,
        label: agent.name,
        type: "agent",
        status: agent.status,
        role: agent.role,
        tokenSize: Math.max(16, Math.min(40, Math.sqrt(totalTokens / 100))),
        x: Math.random() * 600 + 100,
        y: Math.random() * 400 + 100,
        vx: 0,
        vy: 0,
      });
    }

    // Delegation edges (parent → child)
    for (const agent of agents) {
      if (agent.workerAssignment?.parentId) {
        edges.push({
          source: agent.workerAssignment.parentId,
          target: agent.id,
          type: "delegation",
        });
      }
    }

    // Shared file edges (agents that touched same files)
    const fileAgents: Record<string, string[]> = {};
    for (const agent of agents) {
      for (const tool of agent.recentTools) {
        if (tool.target) {
          if (!fileAgents[tool.target]) fileAgents[tool.target] = [];
          if (!fileAgents[tool.target].includes(agent.id)) {
            fileAgents[tool.target].push(agent.id);
          }
        }
      }
    }
    const addedSharedEdges = new Set<string>();
    for (const agentIds of Object.values(fileAgents)) {
      if (agentIds.length > 1) {
        for (let i = 0; i < agentIds.length; i++) {
          for (let j = i + 1; j < agentIds.length; j++) {
            const key = [agentIds[i], agentIds[j]].sort().join("-");
            if (!addedSharedEdges.has(key)) {
              addedSharedEdges.add(key);
              edges.push({ source: agentIds[i], target: agentIds[j], type: "shared-file" });
            }
          }
        }
      }
    }

    // Learning nodes + edges
    for (const learning of learnings.slice(-20)) {
      const lid = `learning-${learning.id}`;
      nodes.push({
        id: lid,
        label: learning.title.slice(0, 30),
        type: "learning",
        tokenSize: 8,
        x: Math.random() * 600 + 100,
        y: Math.random() * 400 + 100,
        vx: 0,
        vy: 0,
      });
      if (learning.agentId) {
        edges.push({ source: learning.agentId, target: lid, type: "learning" });
      }
    }

    return { nodes, edges };
  }, [agents, learnings]);

  // Sync refs with latest data while preserving positions
  useEffect(() => {
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = nodes.map((n) => {
      const prev = existing.get(n.id);
      if (prev) {
        return { ...n, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy, fx: prev.fx, fy: prev.fy };
      }
      return n;
    });
    edgesRef.current = edges;
  }, [nodes, edges]);

  // Force simulation tick
  const simulate = useCallback(() => {
    const ns = nodesRef.current;
    const es = edgesRef.current;
    const w = sizeRef.current.w || 800;
    const h = sizeRef.current.h || 600;

    // Center gravity
    const cx = w / 2;
    const cy = h / 2;
    for (const n of ns) {
      if (n.fx !== undefined) { n.x = n.fx; n.y = n.fy!; continue; }
      n.vx += (cx - n.x) * 0.001;
      n.vy += (cy - n.y) * 0.001;
    }

    // Repulsion (simple n^2 — fine for <50 nodes)
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const dx = ns[j].x - ns[i].x;
        const dy = ns[j].y - ns[i].y;
        const d2 = dx * dx + dy * dy + 1;
        const force = 5000 / d2;
        const fx = dx * force;
        const fy = dy * force;
        if (ns[i].fx === undefined) { ns[i].vx -= fx; ns[i].vy -= fy; }
        if (ns[j].fx === undefined) { ns[j].vx += fx; ns[j].vy += fy; }
      }
    }

    // Edge attraction
    const nodeMap = new Map(ns.map((n) => [n.id, n]));
    for (const e of es) {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetDist = e.type === "delegation" ? 120 : e.type === "shared-file" ? 180 : 150;
      const force = (d - targetDist) * 0.005;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      if (s.fx === undefined) { s.vx += fx; s.vy += fy; }
      if (t.fx === undefined) { t.vx -= fx; t.vy -= fy; }
    }

    // Apply velocity + damping + bounds
    for (const n of ns) {
      if (n.fx !== undefined) continue;
      n.vx *= 0.85;
      n.vy *= 0.85;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(30, Math.min(w - 30, n.x));
      n.y = Math.max(30, Math.min(h - 30, n.y));
    }
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };

      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }

      simulate();

      ctx.clearRect(0, 0, rect.width, rect.height);

      const ns = nodesRef.current;
      const es = edgesRef.current;
      const nodeMap = new Map(ns.map((n) => [n.id, n]));

      // Draw edges
      for (const e of es) {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) continue;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = e.type === "delegation" ? "rgba(88, 166, 255, 0.5)"
          : e.type === "shared-file" ? "rgba(209, 153, 34, 0.3)"
          : "rgba(188, 140, 255, 0.3)";
        ctx.lineWidth = e.type === "delegation" ? 2 : 1;
        if (e.type !== "delegation") {
          ctx.setLineDash([4, 4]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow for delegation
        if (e.type === "delegation") {
          const angle = Math.atan2(t.y - s.y, t.x - s.x);
          const headLen = 8;
          const tipX = t.x - Math.cos(angle) * (t.tokenSize + 4);
          const tipY = t.y - Math.sin(angle) * (t.tokenSize + 4);
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - headLen * Math.cos(angle - 0.4), tipY - headLen * Math.sin(angle - 0.4));
          ctx.lineTo(tipX - headLen * Math.cos(angle + 0.4), tipY - headLen * Math.sin(angle + 0.4));
          ctx.closePath();
          ctx.fillStyle = "rgba(88, 166, 255, 0.7)";
          ctx.fill();
        }
      }

      // Draw nodes
      for (const n of ns) {
        const isSelected = n.id === selectedId;
        const isHovered = n.id === hoverRef.current;

        if (n.type === "learning") {
          // Small diamond for learnings
          ctx.beginPath();
          ctx.moveTo(n.x, n.y - n.tokenSize);
          ctx.lineTo(n.x + n.tokenSize, n.y);
          ctx.lineTo(n.x, n.y + n.tokenSize);
          ctx.lineTo(n.x - n.tokenSize, n.y);
          ctx.closePath();
          ctx.fillStyle = "rgba(188, 140, 255, 0.4)";
          ctx.fill();
          ctx.strokeStyle = "rgba(188, 140, 255, 0.7)";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          // Agent node
          const color = STATUS_COLORS[n.status || "stopped"] || STATUS_COLORS.stopped;

          if (n.role === "coordinator") {
            // Diamond shape for coordinators
            const s = n.tokenSize;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y - s);
            ctx.lineTo(n.x + s, n.y);
            ctx.lineTo(n.x, n.y + s);
            ctx.lineTo(n.x - s, n.y);
            ctx.closePath();
          } else {
            // Circle for workers/standalone
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.tokenSize, 0, Math.PI * 2);
          }

          ctx.fillStyle = color + "33"; // 20% alpha
          ctx.fill();
          ctx.strokeStyle = isSelected ? "#58a6ff" : isHovered ? "#ffffff" : color;
          ctx.lineWidth = isSelected ? 3 : isHovered ? 2 : 1.5;
          ctx.stroke();

          // Glow for active
          if (n.status === "active") {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.tokenSize + 4, 0, Math.PI * 2);
            ctx.strokeStyle = color + "44";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }

        // Label
        ctx.font = n.type === "learning" ? "9px monospace" : "11px monospace";
        ctx.fillStyle = isHovered || isSelected ? "#ffffff" : "#8b949e";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(n.label, n.x, n.y + n.tokenSize + 4);

        // Role badge
        if (n.type === "agent" && n.role && n.role !== "standalone") {
          const badge = n.role === "coordinator" ? "C" : "W";
          ctx.font = "bold 8px monospace";
          ctx.fillStyle = "#58a6ff";
          ctx.fillText(badge, n.x, n.y - n.tokenSize - 10);
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [simulate, selectedId]);

  // Mouse interactions
  const findNode = useCallback((x: number, y: number): GraphNode | null => {
    for (const n of nodesRef.current) {
      const dx = x - n.x;
      const dy = y - n.y;
      if (dx * dx + dy * dy < (n.tokenSize + 5) * (n.tokenSize + 5)) {
        return n;
      }
    }
    return null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = findNode(x, y);
    if (node) {
      dragRef.current = { nodeId: node.id, offsetX: x - node.x, offsetY: y - node.y };
      node.fx = node.x;
      node.fy = node.y;
    }
  }, [findNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragRef.current) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (node) {
        node.fx = x - dragRef.current.offsetX;
        node.fy = y - dragRef.current.offsetY;
      }
    } else {
      const node = findNode(x, y);
      hoverRef.current = node?.id ?? null;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = node ? "pointer" : "default";
      }
    }
  }, [findNode]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (node) {
        // Keep position after drag
        node.fx = undefined;
        node.fy = undefined;
      }
      dragRef.current = null;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = findNode(x, y);
    if (node && node.type === "agent") {
      onSelect(node.id);
    }
  }, [findNode, onSelect]);

  return (
    <div className="flex-1 relative overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      />
      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex gap-4 text-[10px] text-text-secondary bg-surface/80 backdrop-blur-sm px-3 py-2 rounded border border-border">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success" /> Active
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning" /> Idle
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "#484f58" }} /> Stopped
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-error" /> Error
        </span>
        <span className="text-text-secondary">|</span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-accent" /> Delegation
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-warning/50" style={{ borderTop: "1px dashed" }} /> Shared file
        </span>
      </div>
    </div>
  );
}
