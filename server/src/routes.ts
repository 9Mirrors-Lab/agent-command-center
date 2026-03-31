import type { SpawnConfig, LearningSource, LearningCategory } from "@acc/shared";
import { AgentManager } from "./agent-manager.js";
import { MessageBus } from "./bus.js";
import { detectRunningSessions } from "./session-detector.js";
import { LearningsStore } from "./learnings-store.js";
import { McpBridge } from "./mcp-bridge.js";
import { ActivityLog } from "./activity-log.js";
import type { StrategyRegistry } from "./strategy-registry.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export async function handleRequest(
  req: Request,
  manager: AgentManager,
  bus: MessageBus,
  learningsStore?: LearningsStore,
  mcpBridge?: McpBridge,
  activityLog?: ActivityLog,
  strategyRegistry?: StrategyRegistry,
): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // GET /api/agents — list all
  if (path === "/api/agents" && req.method === "GET") {
    return json({ agents: manager.getAll(), stats: manager.getStats() });
  }

  // POST /api/agents — spawn new agent
  if (path === "/api/agents" && req.method === "POST") {
    return handleSpawn(req, manager);
  }

  // GET /api/agents/:id
  const agentMatch = path.match(/^\/api\/agents\/([^/]+)$/);
  if (agentMatch && req.method === "GET") {
    const agent = manager.get(agentMatch[1]);
    if (!agent) return json({ error: "Not found" }, 404);
    return json(agent);
  }

  // POST /api/agents/:id/stop
  const stopMatch = path.match(/^\/api\/agents\/([^/]+)\/stop$/);
  if (stopMatch && req.method === "POST") {
    bus.publish({ type: "agent:stop", agentId: stopMatch[1], from: "user", timestamp: Date.now() });
    return json({ ok: true });
  }

  // POST /api/agents/:id/resume
  const resumeMatch = path.match(/^\/api\/agents\/([^/]+)\/resume$/);
  if (resumeMatch && req.method === "POST") {
    bus.publish({ type: "agent:resume", agentId: resumeMatch[1], from: "user", timestamp: Date.now() });
    return json({ ok: true });
  }

  // POST /api/agents/:id/prompt
  const promptMatch = path.match(/^\/api\/agents\/([^/]+)\/prompt$/);
  if (promptMatch && req.method === "POST") {
    return handlePrompt(req, promptMatch[1], bus);
  }

  // GET /api/agents/:id/output — full output history
  const outputMatch = path.match(/^\/api\/agents\/([^/]+)\/output$/);
  if (outputMatch && req.method === "GET") {
    const agent = manager.get(outputMatch[1]);
    if (!agent) return json({ error: "Not found" }, 404);
    return json({ agentId: outputMatch[1], outputLines: agent.outputLines });
  }

  // DELETE /api/agents/:id
  const deleteMatch = path.match(/^\/api\/agents\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    manager.remove(deleteMatch[1]);
    return json({ ok: true });
  }

  // GET /api/stats
  if (path === "/api/stats" && req.method === "GET") {
    return json(manager.getStats());
  }

  // GET /api/machines — list available machines
  if (path === "/api/machines" && req.method === "GET") {
    return json({ machines: manager.getMachineRegistry().listMachines() });
  }

  // GET /api/sessions/detect — detect running Claude sessions on this machine
  if (path === "/api/sessions/detect" && req.method === "GET") {
    try {
      const sessions = detectRunningSessions();
      return json({ sessions });
    } catch (err) {
      return json({ sessions: [], error: String(err) });
    }
  }

  // ── Learnings ──
  if (path === "/api/learnings" && req.method === "GET" && learningsStore) {
    return json({ learnings: learningsStore.getAll() });
  }
  if (path === "/api/learnings" && req.method === "POST" && learningsStore) {
    return handleAddLearning(req, learningsStore);
  }
  const learningDeleteMatch = path.match(/^\/api\/learnings\/([^/]+)$/);
  if (learningDeleteMatch && req.method === "DELETE" && learningsStore) {
    learningsStore.remove(learningDeleteMatch[1]);
    return json({ ok: true });
  }

  // ── Strategy Registry (ECC Bridge) ──

  // Upload a strategy
  if (path === "/api/strategies" && req.method === "POST" && strategyRegistry) {
    try {
      const body = await req.json() as { name?: string; code?: string };
      if (!body.name || !body.code) return json({ error: "name and code are required" }, 400);
      const result = strategyRegistry.upload(body.name, body.code);
      return json(result, 201);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }

  // List strategies
  if (path === "/api/strategies" && req.method === "GET" && strategyRegistry) {
    return json({ strategies: strategyRegistry.list(), available: strategyRegistry.isAvailable() });
  }

  // Run a strategy
  const stratRunMatch = path.match(/^\/api\/strategies\/([^/]+)\/run$/);
  if (stratRunMatch && req.method === "POST" && mcpBridge) {
    try {
      const name = stratRunMatch[1];
      const body = await req.json() as {
        instrument?: string; dryRun?: boolean; maxTicks?: number; tick?: number;
      };
      const result = await mcpBridge.callTool("run_strategy", {
        strategy: name,
        instrument: body.instrument ?? "ETH-PERP",
        dry_run: body.dryRun ?? true,
        max_ticks: body.maxTicks ?? 100,
        tick: body.tick ?? 10,
      });
      return json({ ok: true, strategyName: name, result });
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }

  // ── Trading (MCP Bridge) ──
  if (path === "/api/trading/available" && req.method === "GET") {
    if (!mcpBridge) return json({ available: false });
    try {
      const available = await mcpBridge.isAvailable();
      return json({ available });
    } catch { return json({ available: false }); }
  }
  if (path === "/api/trading/account" && req.method === "GET" && mcpBridge) {
    return handleMcpCall(mcpBridge, "account");
  }
  if (path === "/api/trading/status" && req.method === "GET" && mcpBridge) {
    return handleMcpCall(mcpBridge, "status");
  }
  if (path === "/api/trading/apex" && req.method === "GET" && mcpBridge) {
    return handleMcpCall(mcpBridge, "apex_status");
  }
  if (path === "/api/trading/journal" && req.method === "GET" && mcpBridge) {
    return handleMcpCall(mcpBridge, "trade_journal");
  }
  if (path === "/api/trading/strategies" && req.method === "GET" && mcpBridge) {
    return handleMcpCall(mcpBridge, "strategies");
  }
  if (path === "/api/trading/run" && req.method === "POST" && mcpBridge) {
    return handleTradingAction(req, mcpBridge, "run_strategy");
  }
  if (path === "/api/trading/reflect" && req.method === "POST" && mcpBridge) {
    return handleMcpCall(mcpBridge, "reflect_run");
  }

  // ── MCP Tools ──
  if (path === "/api/mcp/tools" && req.method === "GET" && mcpBridge) {
    return json({ tools: mcpBridge.getTools() });
  }
  if (path === "/api/mcp/call" && req.method === "POST" && mcpBridge) {
    return handleMcpToolCall(req, mcpBridge);
  }

  // ── Activity Log ──
  if (path === "/api/activity" && req.method === "GET" && activityLog) {
    const since = url.searchParams.get("since");
    const limit = url.searchParams.get("limit");
    const entries = activityLog.getEntries(
      since ? Number(since) : undefined,
      limit ? Number(limit) : 200,
    );
    return json({ entries });
  }

  return null; // Not an API route
}

async function handleSpawn(req: Request, manager: AgentManager): Promise<Response> {
  try {
    const body = await req.json() as Partial<SpawnConfig>;
    if (!body.prompt || !body.workDir) {
      return json({ error: "prompt and workDir are required" }, 400);
    }
    const config: SpawnConfig = {
      prompt: body.prompt,
      workDir: body.workDir,
      name: body.name,
      model: body.model,
      budget: body.budget,
      allowedTools: body.allowedTools,
      runtime: body.runtime,
      role: body.role,
      machine: body.machine,
    };
    const agentId = await manager.spawn(config);
    return json({ agentId, ok: true }, 201);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}

async function handlePrompt(req: Request, agentId: string, bus: MessageBus): Promise<Response> {
  try {
    const body = await req.json() as { prompt: string };
    if (!body.prompt) return json({ error: "prompt is required" }, 400);
    bus.publish({
      type: "agent:prompt",
      agentId,
      prompt: body.prompt,
      from: "user",
      timestamp: Date.now(),
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}

async function handleAddLearning(req: Request, store: LearningsStore): Promise<Response> {
  try {
    const body = await req.json() as {
      agentId?: string; source?: LearningSource; category?: LearningCategory;
      title?: string; detail?: string; confidence?: number;
    };
    if (!body.title || !body.detail) return json({ error: "title and detail required" }, 400);
    const learning = store.add({
      agentId: body.agentId ?? "",
      source: body.source ?? "user",
      category: body.category ?? "insight",
      title: body.title,
      detail: body.detail,
      confidence: body.confidence ?? 0.7,
    });
    return json({ learning, ok: true }, 201);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}

async function handleMcpCall(bridge: McpBridge, tool: string): Promise<Response> {
  try {
    const data = await bridge.callTool(tool);
    return json({ data });
  } catch (err) {
    return json({ error: String(err), data: null }, 500);
  }
}

async function handleTradingAction(req: Request, bridge: McpBridge, tool: string): Promise<Response> {
  try {
    const body = await req.json() as Record<string, any>;
    const data = await bridge.callTool(tool, body);
    return json({ data, ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}

async function handleMcpToolCall(req: Request, bridge: McpBridge): Promise<Response> {
  try {
    const { tool, args } = await req.json() as { tool: string; args?: Record<string, any> };
    if (!tool) return json({ error: "tool name required" }, 400);
    const data = await bridge.callTool(tool, args);
    return json({ data, ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}
