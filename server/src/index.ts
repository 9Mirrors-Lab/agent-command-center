import { DEFAULT_PORT } from "@acc/shared";
import { MessageBus } from "./bus.js";
import { AgentManager } from "./agent-manager.js";
import { ManagerAgent } from "./manager-agent.js";
import { WsBridge } from "./ws-bridge.js";
import { handleRequest } from "./routes.js";

const port = Number(process.env.ACC_PORT) || DEFAULT_PORT;

// Initialize core components
const bus = new MessageBus();
const manager = new AgentManager(bus);
const managerAgent = new ManagerAgent(bus, manager);
const wsBridge = new WsBridge(bus, manager);

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

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
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

    // Fallback
    return new Response("Agent Command Center API", { status: 200 });
  },

  websocket: {
    open(ws) { wsBridge.onOpen(ws); },
    close(ws) { wsBridge.onClose(ws); },
    message(ws, message) { wsBridge.onMessage(ws, message); },
  },
});

console.log(`
  ╔═══════════════════════════════════════╗
  ║       Agent Command Center v0.1       ║
  ╠═══════════════════════════════════════╣
  ║  API:  http://localhost:${port}          ║
  ║  WS:   ws://localhost:${port}/ws         ║
  ║  Manager: ${managerAgent.enabled ? "ON " : "OFF"}                        ║
  ╚═══════════════════════════════════════╝
`);
