import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { McpTool } from "@acc/shared";

const AGENT_CLI_DIR = join(homedir(), "agent-cli");

/** All known MCP tools from agent-cli */
const MCP_TOOLS: McpTool[] = [
  // Fast tools
  { name: "strategies", description: "List all available trading strategies", group: "fast" },
  { name: "builder_status", description: "Get builder fee configuration", group: "fast" },
  { name: "wallet_list", description: "List saved encrypted keystores", group: "fast" },
  { name: "setup_check", description: "Validate environment and dependencies", group: "fast" },
  { name: "account", description: "Show HL account state — equity, balance, positions", group: "fast" },
  { name: "status", description: "Show positions, P&L, and risk state", group: "fast" },
  // Action tools
  { name: "trade", description: "Place a single manual order", group: "action" },
  { name: "run_strategy", description: "Start autonomous trading with a strategy", group: "action" },
  { name: "radar_run", description: "Screen HL perps for trading setups", group: "action" },
  { name: "apex_status", description: "Get APEX orchestrator status", group: "action" },
  { name: "apex_run", description: "Run APEX autonomous multi-slot trading", group: "action" },
  // Self-improvement tools
  { name: "reflect_run", description: "Run REFLECT performance review", group: "self-improvement" },
  { name: "agent_memory", description: "Query agent memory events", group: "self-improvement" },
  { name: "trade_journal", description: "View structured trade journal", group: "self-improvement" },
  { name: "judge_report", description: "Get latest judge report", group: "self-improvement" },
  { name: "obsidian_context", description: "Read trading context from Obsidian", group: "self-improvement" },
];

/** Maps MCP tool names to CLI commands */
const TOOL_TO_CLI: Record<string, string[]> = {
  strategies: ["strategies"],
  builder_status: ["builder", "status"],
  wallet_list: ["wallet", "list"],
  setup_check: ["setup", "check"],
  account: ["account"],
  status: ["status"],
  trade: ["trade"],
  run_strategy: ["run"],
  radar_run: ["radar", "run"],
  apex_status: ["apex", "status"],
  apex_run: ["apex", "run"],
  reflect_run: ["reflect", "run"],
  agent_memory: ["guard", "memory"],
  trade_journal: ["journal", "show"],
  judge_report: ["guard", "judge"],
  obsidian_context: ["guard", "obsidian"],
};

export class McpBridge {
  private cliDir: string;
  private cache = new Map<string, { data: any; expires: number }>();
  private cacheTtl = 5000; // 5s cache

  constructor(cliDir?: string) {
    this.cliDir = cliDir ?? AGENT_CLI_DIR;
  }

  async isAvailable(): Promise<boolean> {
    if (!existsSync(this.cliDir)) return false;
    try {
      await this.callTool("strategies");
      return true;
    } catch {
      return false;
    }
  }

  async callTool(name: string, args?: Record<string, any>): Promise<any> {
    // Check cache
    const cacheKey = `${name}:${JSON.stringify(args ?? {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    const cliArgs = TOOL_TO_CLI[name];
    if (!cliArgs) throw new Error(`Unknown MCP tool: ${name}`);

    // Build CLI args from tool args
    const fullArgs = [...cliArgs];
    if (args) {
      for (const [key, value] of Object.entries(args)) {
        if (value === true) {
          fullArgs.push(`--${key}`);
        } else if (value !== false && value !== undefined && value !== null) {
          fullArgs.push(`--${key}`, String(value));
        }
      }
    }

    const result = await this.runCli(fullArgs);

    // Try to parse as JSON
    let parsed: any;
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = { raw: result };
    }

    // Cache the result
    this.cache.set(cacheKey, { data: parsed, expires: Date.now() + this.cacheTtl });

    return parsed;
  }

  private async runCli(args: string[]): Promise<string> {
    const proc = Bun.spawn(["python", "-m", "cli.main", ...args], {
      cwd: this.cliDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`CLI exited with ${exitCode}: ${stderr.trim() || stdout.trim()}`);
    }

    return stdout.trim();
  }

  getTools(): McpTool[] {
    return MCP_TOOLS;
  }

  // Convenience methods
  async getAccount() { return this.callTool("account"); }
  async getStatus() { return this.callTool("status"); }
  async getApexStatus() { return this.callTool("apex_status"); }
  async getTradeJournal() { return this.callTool("trade_journal"); }
  async getStrategies() { return this.callTool("strategies"); }
  async getReflect() { return this.callTool("reflect_run"); }
}
