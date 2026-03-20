export const DEFAULT_PORT = 4200;
export const MAX_OUTPUT_LINES = 500;
export const RING_BUFFER_SIZE = 1000;
export const MANAGER_INTERVAL_MS = 30_000;
export const STALL_THRESHOLD_MS = 90_000;

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  opus:   { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
  sonnet: { input: 3.0 / 1_000_000,  output: 15.0 / 1_000_000 },
  haiku:  { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
};

export const DEFAULT_ALLOWED_TOOLS = [
  "Bash", "Edit", "Read", "Write", "Glob", "Grep",
  "WebSearch", "WebFetch",
];

export const RUNTIME_INFO: Record<string, {
  label: string;
  binaryName: string;
  isMultiTurn: boolean;
  supportsModel: boolean;
  supportsBudget: boolean;
}> = {
  claude: { label: "Claude Code", binaryName: "claude", isMultiTurn: true, supportsModel: true, supportsBudget: true },
  codex: { label: "Codex", binaryName: "codex", isMultiTurn: false, supportsModel: false, supportsBudget: false },
  cursor: { label: "Cursor Agent", binaryName: "cursor-agent", isMultiTurn: false, supportsModel: false, supportsBudget: false },
  opencode: { label: "OpenCode", binaryName: "opencode", isMultiTurn: false, supportsModel: false, supportsBudget: false },
};
