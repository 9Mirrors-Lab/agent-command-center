import { DEFAULT_PORT } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { AgentManager } from "./agent-manager.js";
import { ManagerAgent } from "./manager-agent.js";
import { WsBridge } from "./ws-bridge.js";
import { PtyManager } from "./pty-manager.js";
import { handleRequest } from "./routes.js";
import { existsSync } from "fs";
import { join, extname } from "path";

const port = Number(process.env.ACC_PORT) || DEFAULT_PORT;

// Initialize core components
const bus = new MessageBus();
const manager = new AgentManager(bus);
const managerAgent = new ManagerAgent(bus, manager);
const wsBridge = new WsBridge(bus, manager);
const ptyManager = new PtyManager();

// Start manager agent if enabled (default: off, enable via API or env)
if (process.env.ACC_MANAGER === "1") {
  managerAgent.start();
}

// Log bus messages in dev
bus.subscribe((msg) => {
  console.log(`[bus] ${msg.type}`, "agentId" in msg ? msg.agentId?.slice(0, 8) : "");
});

const server = Bun.serve({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    // Terminal WebSocket upgrade: /ws/terminal/:agentId
    if (url.pathname.startsWith("/ws/terminal/")) {
      const agentId = url.pathname.split("/ws/terminal/")[1];
      if (!agentId) {
        return new Response("Missing agentId", { status: 400 });
      }
      const upgraded = server.upgrade(req, { data: { type: "terminal", agentId } });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // Bus WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, { data: { type: "bus" } });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // REST API
    const apiResponse = handleRequest(req, manager, bus);
    if (apiResponse) return apiResponse;

    // Manager agent toggle
    if (url.pathname === "/api/manager/start" && req.method === "POST") {
      managerAgent.start();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    if (url.pathname === "/api/manager/stop" && req.method === "POST") {
      managerAgent.stop();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Static file serving (production)
    const distDir = join(import.meta.dir, "../../client/dist");
    if (existsSync(distDir)) {
      const filePath = join(distDir, url.pathname === "/" ? "index.html" : url.pathname);
      if (existsSync(filePath) && !filePath.includes("..")) {
        const contentTypes: Record<string, string> = {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".ico": "image/x-icon",
          ".woff": "font/woff",
          ".woff2": "font/woff2",
        };
        const ext = extname(filePath);
        const contentType = contentTypes[ext] ?? "application/octet-stream";
        return new Response(Bun.file(filePath), {
          headers: { "Content-Type": contentType },
        });
      }

      // SPA fallback — serve index.html for non-API, non-WS routes
      const indexPath = join(distDir, "index.html");
      if (existsSync(indexPath)) {
        return new Response(Bun.file(indexPath), {
          headers: { "Content-Type": "text/html" },
        });
      }
    }

    // Fallback
    return new Response("Agent Command Center API", { status: 200 });
  },

  websocket: {
    open(ws) {
      const data = ws.data as { type: string; agentId?: string } | undefined;
      if (data?.type === "terminal" && data.agentId) {
        // Terminal WebSocket — attach to PTY
        const agent = manager.get(data.agentId);
        const workDir = agent?.config.workDir || process.env.HOME || "/";
        ptyManager.attach(data.agentId, workDir, ws);
      } else {
        // Bus WebSocket
        wsBridge.onOpen(ws);
      }
    },
    close(ws) {
      const data = ws.data as { type: string; agentId?: string } | undefined;
      if (data?.type === "terminal" && data.agentId) {
        ptyManager.detach(data.agentId);
      } else {
        wsBridge.onClose(ws);
      }
    },
    message(ws, message) {
      const data = ws.data as { type: string; agentId?: string } | undefined;
      if (data?.type === "terminal" && data.agentId) {
        ptyManager.handleMessage(data.agentId, message as string | Buffer);
      } else {
        wsBridge.onMessage(ws, message);
      }
    },
  },
});

// Graceful shutdown
function shutdown() {
  console.log("\n[ACC] Shutting down gracefully...");
  ptyManager.killAll();
  for (const agent of manager.getAll()) {
    manager.stop(agent.id);
  }
  server.stop(true);
  console.log("[ACC] Shutdown complete.");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`
  ╔═══════════════════════════════════════╗
  ║       Agent Command Center v0.1       ║
  ╠═══════════════════════════════════════╣
  ║  API:  http://localhost:${port}          ║
  ║  WS:   ws://localhost:${port}/ws         ║
  ║  Manager: ${managerAgent.enabled ? "ON " : "OFF"}                        ║
  ╚═══════════════════════════════════════╝
`);
