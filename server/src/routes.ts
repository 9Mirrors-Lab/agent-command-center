import type { SpawnConfig } from "@acc/shared";
import { AgentManager } from "./agent-manager.js";
import { MessageBus } from "./bus.js";

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

export function handleRequest(
  req: Request,
  manager: AgentManager,
  bus: MessageBus
): Response | null {
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
