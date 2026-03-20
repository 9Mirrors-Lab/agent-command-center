import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { readdirSync, statSync, readFileSync } from "node:fs";

export interface DetectedSession {
  pid: number;
  tty: string;
  cwd: string;
  sessionId: string;
  projectDir: string;
  lastActive: number;
  recentMessages: string[];
}

/**
 * Detect running Claude Code CLI sessions on this machine.
 * Scans running processes and matches them to session files.
 */
export function detectRunningSessions(): DetectedSession[] {
  const sessions: DetectedSession[] = [];

  try {
    // Find running claude CLI processes (not Claude.app)
    const psOutput = execSync(
      `ps -eo pid,tty,args 2>/dev/null | grep -E "\\bclaude$" | grep -v grep`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();

    if (!psOutput) return [];

    const processes = psOutput.split("\n").map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parseInt(parts[0]),
        tty: parts[1],
        cmd: parts.slice(2).join(" "),
      };
    }).filter((p) => !isNaN(p.pid) && p.cmd === "claude");

    // Get CWD for each process
    for (const proc of processes) {
      try {
        const cwd = execSync(
          `lsof -p ${proc.pid} -Fn 2>/dev/null | grep -A1 "^fcwd" | grep "^n" | sed 's/^n//'`,
          { encoding: "utf-8", timeout: 3000 }
        ).trim();

        // Find the most recently modified session file for this project
        // Claude converts both / and _ to - in project dir names
        const projectKey = cwd.replace(/[/_]/g, "-");
        const projectDir = join(homedir(), ".claude", "projects", projectKey);

        let sessionId = "";
        let lastActive = 0;
        let recentMessages: string[] = [];

        try {
          const files = readdirSync(projectDir)
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => ({
              name: f,
              path: join(projectDir, f),
              mtime: statSync(join(projectDir, f)).mtimeMs,
            }))
            .sort((a, b) => b.mtime - a.mtime);

          if (files.length > 0) {
            sessionId = basename(files[0].name, ".jsonl");
            lastActive = files[0].mtime;

            // Read last few messages for context
            try {
              const content = readFileSync(files[0].path, "utf-8");
              const lines = content.trim().split("\n").filter(Boolean);
              const lastLines = lines.slice(-5);
              for (const line of lastLines) {
                try {
                  const msg = JSON.parse(line);
                  if (msg.type === "human" || msg.type === "assistant") {
                    const text = typeof msg.message?.content === "string"
                      ? msg.message.content
                      : Array.isArray(msg.message?.content)
                        ? msg.message.content
                            .filter((b: any) => b.type === "text")
                            .map((b: any) => b.text)
                            .join(" ")
                        : "";
                    if (text) recentMessages.push(text.slice(0, 200));
                  }
                } catch {}
              }
            } catch {}
          }
        } catch {}

        sessions.push({
          pid: proc.pid,
          tty: proc.tty,
          cwd: cwd || homedir(),
          sessionId,
          projectDir,
          lastActive,
          recentMessages: recentMessages.slice(-3),
        });
      } catch {}
    }
  } catch {}

  return sessions;
}
