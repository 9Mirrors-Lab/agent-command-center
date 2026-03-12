import type { PendingApproval, ApprovalType, BusMessage } from "@acc/shared";
import { MessageBus } from "./bus.js";

/**
 * Approval Gate — detects when agents are waiting for user input
 * (plan approval, continue prompts, permission requests) and queues
 * them as pending approvals that the user can batch-accept from the dashboard.
 *
 * Detection patterns in agent output:
 * - Plan mode: "Entered plan mode" / "ExitPlanMode" / plan approval prompts
 * - Continue: agent idle with "continue?" or similar
 * - Permission: tool permission prompts
 */

// Patterns that indicate an agent is waiting for user input
const PLAN_PATTERNS = [
  /plan.*(?:ready|approval|review|approve)/i,
  /ExitPlanMode/,
  /plan (?:mode|file).*written/i,
  /should I proceed/i,
  /ready to implement/i,
  /here(?:'s| is) (?:my|the) plan/i,
];

const CONTINUE_PATTERNS = [
  /shall I continue/i,
  /want me to (?:continue|proceed|go ahead)/i,
  /ready (?:to|for) (?:the )?next/i,
  /waiting for (?:your )?(?:input|go-ahead|confirmation)/i,
  /phase \d+ complete/i,
  /what (?:would you like|should I do) next/i,
];

const PERMISSION_PATTERNS = [
  /permission (?:to|for|denied)/i,
  /approve (?:this|the) (?:action|tool)/i,
  /requires? (?:your )?(?:approval|permission)/i,
];

export class ApprovalGate {
  private bus: MessageBus;
  private pending = new Map<string, PendingApproval>();
  // Track recent text per agent to detect patterns across multiple lines
  private recentText = new Map<string, string[]>();

  constructor(bus: MessageBus) {
    this.bus = bus;
    bus.subscribe((msg) => this.handleMessage(msg));
  }

  private handleMessage(msg: BusMessage): void {
    if (msg.type === "agent:text" && !msg.partial) {
      this.analyzeText(msg.agentId, msg.content);
    }

    // Agent going idle after active work might mean it's waiting
    if (msg.type === "agent:status" && msg.status === "idle") {
      this.checkIdleApproval(msg.agentId);
    }

    // Handle user resolving an approval
    if (msg.type === "approval:resolved") {
      this.resolveApproval(msg.approvalId, msg.accepted, msg.agentId);
    }
  }

  private analyzeText(agentId: string, content: string): void {
    // Maintain a sliding window of recent text per agent
    const recent = this.recentText.get(agentId) ?? [];
    recent.push(content);
    if (recent.length > 10) recent.shift();
    this.recentText.set(agentId, recent);

    const combined = recent.join("\n");

    // Check for plan approval
    if (PLAN_PATTERNS.some((p) => p.test(combined))) {
      this.createApproval(agentId, "plan", "Plan ready for review", content);
      this.recentText.set(agentId, []); // Reset after detection
      return;
    }

    // Check for continue prompt
    if (CONTINUE_PATTERNS.some((p) => p.test(combined))) {
      this.createApproval(agentId, "continue", "Waiting to continue", content);
      this.recentText.set(agentId, []);
      return;
    }

    // Check for permission request
    if (PERMISSION_PATTERNS.some((p) => p.test(combined))) {
      this.createApproval(agentId, "permission", "Permission requested", content);
      this.recentText.set(agentId, []);
      return;
    }
  }

  private checkIdleApproval(agentId: string): void {
    const recent = this.recentText.get(agentId) ?? [];
    if (recent.length === 0) return;

    const lastText = recent[recent.length - 1] ?? "";
    // If the last thing the agent said looks like a question, it's probably waiting
    if (lastText.includes("?") || /what|should|would|shall|want/i.test(lastText)) {
      this.createApproval(agentId, "continue", "Agent idle — may need input", lastText);
    }
  }

  private createApproval(agentId: string, type: ApprovalType, title: string, detail: string): void {
    // Don't create duplicate approvals for the same agent + type
    for (const existing of this.pending.values()) {
      if (existing.agentId === agentId && existing.type === type && !existing.resolved) {
        return;
      }
    }

    const approval: PendingApproval = {
      id: crypto.randomUUID(),
      agentId,
      type,
      title,
      detail: detail.slice(0, 500),
      createdAt: Date.now(),
      resolved: false,
    };

    this.pending.set(approval.id, approval);

    this.bus.publish({
      type: "approval:requested",
      agentId,
      approval,
      timestamp: Date.now(),
    });
  }

  private resolveApproval(approvalId: string, accepted: boolean, agentId: string): void {
    const approval = this.pending.get(approvalId);
    if (!approval) return;

    approval.resolved = true;

    if (accepted) {
      // Send a continue/accept prompt to the agent
      const prompt = approval.type === "plan"
        ? "The plan looks good. Please proceed with implementation."
        : "Please continue.";

      this.bus.publish({
        type: "agent:prompt",
        agentId,
        prompt,
        from: "user-approval",
        timestamp: Date.now(),
      });
    }
  }

  getPending(): PendingApproval[] {
    return Array.from(this.pending.values()).filter((a) => !a.resolved);
  }

  getPendingForAgent(agentId: string): PendingApproval[] {
    return this.getPending().filter((a) => a.agentId === agentId);
  }
}
