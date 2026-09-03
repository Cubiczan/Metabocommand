import { buildEvidencePacket } from "@/lib/governance-watchdog";
import type {
  Agent,
  AgentActionLogEntry,
  ApprovalItem,
  ApprovalQueueName,
  ApprovalStatus,
} from "@/lib/supabase/types";
import { HitlError } from "./errors";
import { DEMO_ACTORS } from "./fixtures";
import { MemoryHitlStore } from "./memory-store";
import type { ActionLogListFilter, ApprovalListFilter, HitlActor, HitlStore } from "./store";

export interface RequestApprovalInput {
  agent_name: string;
  queue: ApprovalQueueName;
  action_description: string;
  financial_impact: string;
  impact_amount?: number | null;
}

export interface DecideApprovalInput {
  id: string;
  decision: Extract<ApprovalStatus, "approved" | "rejected">;
  note?: string;
  actor?: HitlActor;
}

export interface HitlHooks {
  onSubmitted?(item: ApprovalItem): Promise<void>;
  onDecided?(
    item: ApprovalItem,
    actor: HitlActor,
    decision: "approved" | "rejected",
    note?: string,
  ): Promise<void>;
}

export interface CapitalReflexSnapshot {
  system: "capital_reflex";
  queue: "finance";
  brand: "Cubiczan";
  spend_gates: {
    package: "@cubiczan/chp-mcp";
    tool: "evaluate_spend_gate";
    note: "Numeric spend/capital gates stay on @cubiczan/chp-mcp. This MCP is the approval-queue surface only.";
  };
  agents: Agent[];
  pending_approvals: ApprovalItem[];
}

/**
 * Product HITL operations. Same submit/decide/log rules as the dashboard APIs.
 * Does not invent workflow states.
 */
export class HitlService {
  private readonly store: HitlStore;
  private readonly hooks: HitlHooks;

  constructor(store: HitlStore, hooks: HitlHooks = {}) {
    this.store = store;
    this.hooks = hooks;
  }

  async listPendingApprovals(filter: Omit<ApprovalListFilter, "status"> = {}): Promise<ApprovalItem[]> {
    return this.store.listApprovals({ ...filter, status: "pending" });
  }

  async listApprovals(filter: ApprovalListFilter = {}): Promise<ApprovalItem[]> {
    return this.store.listApprovals(filter);
  }

  async getApproval(id: string): Promise<ApprovalItem> {
    const item = await this.store.getApproval(id);
    if (!item) {
      throw new HitlError("NOT_FOUND", "Item not found");
    }
    return item;
  }

  async requestApproval(input: RequestApprovalInput): Promise<ApprovalItem> {
    if (!input.agent_name.trim() || !input.action_description.trim() || !input.financial_impact.trim()) {
      throw new HitlError("INVALID", "Invalid payload");
    }

    const evidencePacket = buildEvidencePacket({
      agentName: input.agent_name,
      queue: input.queue,
      actionDescription: input.action_description,
      financialImpact: input.financial_impact,
      impactAmount: input.impact_amount ?? null,
    });

    const inserted = await this.store.insertApproval({
      agent_name: input.agent_name,
      queue: input.queue,
      action_description: input.action_description,
      financial_impact: input.financial_impact,
      impact_amount: input.impact_amount ?? null,
      agent_seniority: evidencePacket.actor.seniority,
      watchdog_decision: evidencePacket.watchdog.decision,
      policy_flags: evidencePacket.watchdog.policyFlags,
      evidence_packet_id: evidencePacket.id,
      evidence_packet: evidencePacket as unknown as Record<string, unknown>,
    });

    await this.store.insertActionLog({
      agent_name: input.agent_name,
      queue: input.queue,
      action_type: "Proposal Submitted",
      description: input.action_description,
      outcome: "Pending Approval",
      decided_by: "—",
      reasoning_summary:
        `Submitted from ${input.agent_name} view. Watchdog decision: ${evidencePacket.watchdog.decision}; ` +
        `flags: ${evidencePacket.watchdog.policyFlags.join(", ")}; evidence packet: ${evidencePacket.id}.`,
      approval_item_id: inserted.id,
      evidence_packet_id: evidencePacket.id,
      policy_flags: evidencePacket.watchdog.policyFlags,
    });

    if (this.hooks.onSubmitted) {
      await this.hooks.onSubmitted(inserted);
    }

    return inserted;
  }

  async decideApproval(input: DecideApprovalInput): Promise<ApprovalItem> {
    const item = await this.store.getApproval(input.id);
    if (!item) {
      throw new HitlError("NOT_FOUND", "Item not found");
    }

    const actor = input.actor ?? DEMO_ACTORS[item.queue];
    if (actor.role !== item.queue) {
      throw new HitlError("FORBIDDEN", "Role/queue mismatch");
    }
    if (item.status !== "pending") {
      throw new HitlError("ALREADY_DECIDED", "Item already decided");
    }

    const decidedAt = new Date().toISOString();
    const updated = await this.store.updateApprovalDecision(
      input.id,
      input.decision,
      actor.id,
      decidedAt,
    );
    if (!updated || updated.status === "pending") {
      throw new HitlError("ALREADY_DECIDED", "Item already decided");
    }

    const verb = input.decision === "approved" ? "Approved" : "Rejected";
    const noteSuffix = input.note?.trim() ? ` Note: ${input.note.trim()}` : "";

    await this.store.insertActivity({
      user_id: actor.id,
      user_display_name: actor.displayName,
      user_email: actor.email,
      user_role: actor.role,
      activity_type: input.decision === "approved" ? "Approval — Approved" : "Approval — Rejected",
      description: `${verb} ${item.agent_name} proposal: ${item.action_description}${noteSuffix}`,
      contextual_reference: item.id,
    });

    await this.store.insertActionLog({
      agent_name: item.agent_name,
      queue: item.queue,
      action_type: "Decision",
      description: item.action_description,
      outcome: verb,
      decided_by: `${actor.displayName} (${actor.email})`,
      reasoning_summary:
        `Decision recorded by ${actor.displayName}` +
        `${item.evidence_packet_id ? ` against evidence packet ${item.evidence_packet_id}` : ""}` +
        `${noteSuffix}`,
      approval_item_id: item.id,
      evidence_packet_id: item.evidence_packet_id ?? null,
      policy_flags: item.policy_flags ?? [],
    });

    if (this.hooks.onDecided) {
      await this.hooks.onDecided(updated, actor, input.decision, input.note);
    }

    return updated;
  }

  async listAgentActionLog(filter: ActionLogListFilter = {}): Promise<AgentActionLogEntry[]> {
    return this.store.listActionLog(filter);
  }

  async listCapitalReflex(): Promise<CapitalReflexSnapshot> {
    const [agents, pending_approvals] = await Promise.all([
      this.store.listAgents(),
      this.store.listApprovals({ queue: "finance", status: "pending" }),
    ]);

    return {
      system: "capital_reflex",
      queue: "finance",
      brand: "Cubiczan",
      spend_gates: {
        package: "@cubiczan/chp-mcp",
        tool: "evaluate_spend_gate",
        note: "Numeric spend/capital gates stay on @cubiczan/chp-mcp. This MCP is the approval-queue surface only.",
      },
      agents: agents.filter((agent) => agent.system === "capital_reflex"),
      pending_approvals,
    };
  }
}

export function createDemoHitlService(hooks: HitlHooks = {}): HitlService {
  return new HitlService(new MemoryHitlStore(), hooks);
}
