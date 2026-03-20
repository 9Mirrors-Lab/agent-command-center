import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import type { MachineConfig } from "@acc/shared";

const CONFIG_DIR = join(homedir(), ".agent-command-center");
const CONFIG_PATH = join(CONFIG_DIR, "config.toml");

const DEFAULT_CONFIG = `# Agent Command Center Configuration

[[machines]]
name = "local"
`;

export class MachineRegistry {
  private machines: MachineConfig[] = [{ name: "local" }];

  constructor() {
    this.load();
  }

  private load(): void {
    if (!existsSync(CONFIG_PATH)) {
      // Create default config
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(CONFIG_PATH, DEFAULT_CONFIG, "utf-8");
      return;
    }

    try {
      const content = readFileSync(CONFIG_PATH, "utf-8");
      const parsed = this.parseTOML(content);
      if (Array.isArray(parsed.machines) && parsed.machines.length > 0) {
        this.machines = parsed.machines
          .filter((m) => m.name)
          .map((m) => ({
            name: m.name,
            host: m.host || undefined,
            user: m.user || undefined,
            sshKey: m.sshKey || undefined,
            tmuxSession: m.tmuxSession || undefined,
          }));
      }
    } catch (err) {
      console.error("[MachineRegistry] Failed to load config:", err);
    }
  }

  /**
   * Minimal TOML parser for [[machines]] array of tables.
   * Handles: name, host, user, sshKey, tmuxSession fields.
   */
  private parseTOML(content: string): { machines: Record<string, string>[] } {
    const machines: Record<string, string>[] = [];
    let current: Record<string, string> | null = null;

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();

      // Skip comments and empty lines
      if (!line || line.startsWith("#")) continue;

      // Array table header
      if (line === "[[machines]]") {
        if (current) machines.push(current);
        current = {};
        continue;
      }

      // Key-value pair
      if (current && line.includes("=")) {
        const eqIdx = line.indexOf("=");
        const key = line.slice(0, eqIdx).trim();
        let value = line.slice(eqIdx + 1).trim();
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        current[key] = value;
      }
    }

    if (current) machines.push(current);
    return { machines };
  }

  getMachine(name: string): MachineConfig | undefined {
    return this.machines.find((m) => m.name === name);
  }

  listMachines(): MachineConfig[] {
    return [...this.machines];
  }

  isRemote(name: string): boolean {
    const machine = this.getMachine(name);
    return !!machine?.host;
  }
}
