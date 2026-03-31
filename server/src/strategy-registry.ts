/**
 * StrategyRegistry — Upload, register, and list trading strategies
 * in the agent-cli installation. Used by ECC to deploy strategies remotely.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const AGENT_CLI_DIR = join(homedir(), "agent-cli");
const STRATEGIES_DIR = join(AGENT_CLI_DIR, "strategies");
const REGISTRY_PATH = join(AGENT_CLI_DIR, "cli", "strategy_registry.py");

export interface StrategyInfo {
  name: string;
  description: string;
  path: string;
  fileExists: boolean;
}

export class StrategyRegistry {
  /** Upload a strategy file and register it */
  upload(name: string, code: string): { ok: boolean; registered: boolean; filePath: string } {
    if (!existsSync(STRATEGIES_DIR)) {
      throw new Error("agent-cli strategies directory not found. Install agent-cli first.");
    }

    // Sanitize name
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    const filePath = join(STRATEGIES_DIR, `${safeName}.py`);

    // Write strategy file
    writeFileSync(filePath, code, "utf-8");

    // Register in strategy_registry.py
    const registered = this.register(safeName, code);

    return { ok: true, registered, filePath };
  }

  /** List all registered strategies */
  list(): StrategyInfo[] {
    if (!existsSync(REGISTRY_PATH)) return [];

    try {
      const content = readFileSync(REGISTRY_PATH, "utf-8");
      const strategies: StrategyInfo[] = [];

      // Parse STRATEGY_REGISTRY dict entries
      const entryRegex = /"(\w+)":\s*\{[^}]*"path":\s*"([^"]+)"[^}]*(?:"description":\s*"([^"]*)")?/g;
      let match;
      while ((match = entryRegex.exec(content)) !== null) {
        const name = match[1];
        const path = match[2];
        const description = match[3] ?? "";
        const modulePath = path.split(":")[0].replace(/\./g, "/") + ".py";
        const filePath = join(AGENT_CLI_DIR, modulePath);

        strategies.push({
          name,
          description,
          path,
          fileExists: existsSync(filePath),
        });
      }

      return strategies;
    } catch {
      return [];
    }
  }

  /** Check if a strategy exists */
  exists(name: string): boolean {
    return this.list().some((s) => s.name === name);
  }

  /** Check if agent-cli is available */
  isAvailable(): boolean {
    return existsSync(AGENT_CLI_DIR) && existsSync(STRATEGIES_DIR);
  }

  // ── Private ──

  private register(name: string, code: string): boolean {
    if (!existsSync(REGISTRY_PATH)) return false;

    try {
      const content = readFileSync(REGISTRY_PATH, "utf-8");

      // Already registered?
      if (content.includes(`"${name}"`)) return true;

      // Extract class name from code
      const classMatch = code.match(/class\s+(\w+)\s*\(/);
      const className = classMatch?.[1] ?? `${this.toPascalCase(name)}Strategy`;

      const entry = `    "${name}": {\n        "path": "strategies.${name}:${className}",\n        "description": "Deployed via ECC Strategy Lab",\n        "params": {},\n    },\n`;

      // Insert before the closing brace of STRATEGY_REGISTRY
      const lastBrace = content.lastIndexOf("}");
      if (lastBrace === -1) return false;

      const updated = content.slice(0, lastBrace) + entry + content.slice(lastBrace);
      writeFileSync(REGISTRY_PATH, updated, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  private toPascalCase(s: string): string {
    return s.split(/[_-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }
}
