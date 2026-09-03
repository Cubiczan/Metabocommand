import { randomUUID } from "node:crypto";
import type {
  ActivityHistoryEntry,
  Agent,
  AgentActionLogEntry,
  ApprovalItem,
} from "@/lib/supabase/types";
import { DEMO_ACTION_LOG, DEMO_AGENTS, DEMO_APPROVALS } from "./fixtures";
import type {
  ActionLogListFilter,
  ApprovalListFilter,
  HitlStore,
  NewActionLogEntry,
  NewActivityEntry,
  NewApprovalItem,
} from "./store";

function cloneApproval(item: ApprovalItem): ApprovalItem {
  return {
    ...item,
    policy_flags: item.policy_flags ? [...item.policy_flags] : item.policy_flags,
    evidence_packet: item.evidence_packet
      ? { ...item.evidence_packet }
      : item.evidence_packet,
  };
}

function cloneLog(entry: AgentActionLogEntry): AgentActionLogEntry {
  return {
    ...entry,
    policy_flags: entry.policy_flags ? [...entry.policy_flags] : entry.policy_flags,
  };
}

/**
 * In-process store seeded from `supabase/migrations/0002_seed.sql`.
 * Safe local/demo path — no Next.js server, no Supabase.
 */
export class MemoryHitlStore implements HitlStore {
  private approvals: ApprovalItem[];
  private logs: AgentActionLogEntry[];
  private activities: ActivityHistoryEntry[];
  private readonly agents: Agent[];

  constructor() {
    this.approvals = DEMO_APPROVALS.map(cloneApproval);
    this.logs = DEMO_ACTION_LOG.map(cloneLog);
    this.activities = [];
    this.agents = DEMO_AGENTS.map((agent) => ({ ...agent }));
  }

  async listApprovals(filter: ApprovalListFilter = {}): Promise<ApprovalItem[]> {
    return this.approvals
      .filter((item) => (filter.queue ? item.queue === filter.queue : true))
      .filter((item) => (filter.status ? item.status === filter.status : true))
      .slice()
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "pending" ? -1 : 1;
        }
        return b.submitted_at.localeCompare(a.submitted_at);
      })
      .map(cloneApproval);
  }

  async getApproval(id: string): Promise<ApprovalItem | null> {
    const found = this.approvals.find((item) => item.id === id);
    return found ? cloneApproval(found) : null;
  }

  async insertApproval(input: NewApprovalItem): Promise<ApprovalItem> {
    const created: ApprovalItem = {
      id: randomUUID(),
      agent_id: this.agents.find((agent) => agent.name === input.agent_name)?.id ?? "",
      agent_name: input.agent_name,
      queue: input.queue,
      action_description: input.action_description,
      financial_impact: input.financial_impact,
      impact_amount: input.impact_amount,
      status: "pending",
      submitted_at: new Date().toISOString(),
      decided_at: null,
      decided_by: null,
      slack_notified: false,
      agent_seniority: input.agent_seniority,
      watchdog_decision: input.watchdog_decision,
      policy_flags: [...input.policy_flags],
      evidence_packet_id: input.evidence_packet_id,
      evidence_packet: { ...input.evidence_packet },
    };
    this.approvals = [created, ...this.approvals];
    return cloneApproval(created);
  }

  async updateApprovalDecision(
    id: string,
    decision: "approved" | "rejected",
    actorId: string,
    decidedAt: string,
  ): Promise<ApprovalItem | null> {
    const index = this.approvals.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const current = this.approvals[index];
    if (current.status !== "pending") return cloneApproval(current);
    const next: ApprovalItem = {
      ...current,
      status: decision,
      decided_at: decidedAt,
      decided_by: actorId,
    };
    this.approvals = [
      ...this.approvals.slice(0, index),
      next,
      ...this.approvals.slice(index + 1),
    ];
    return cloneApproval(next);
  }

  async listActionLog(filter: ActionLogListFilter = {}): Promise<AgentActionLogEntry[]> {
    const limit = filter.limit ?? 500;
    return this.logs
      .filter((entry) => (filter.queue ? entry.queue === filter.queue : true))
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
      .map(cloneLog);
  }

  async insertActionLog(entry: NewActionLogEntry): Promise<AgentActionLogEntry> {
    const created: AgentActionLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      agent_name: entry.agent_name,
      queue: entry.queue,
      action_type: entry.action_type,
      description: entry.description,
      outcome: entry.outcome,
      decided_by: entry.decided_by,
      reasoning_summary: entry.reasoning_summary,
      approval_item_id: entry.approval_item_id,
      evidence_packet_id: entry.evidence_packet_id ?? null,
      policy_flags: entry.policy_flags ?? [],
    };
    this.logs = [created, ...this.logs];
    return cloneLog(created);
  }

  async insertActivity(entry: NewActivityEntry): Promise<ActivityHistoryEntry> {
    const created: ActivityHistoryEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      user_id: entry.user_id,
      user_display_name: entry.user_display_name,
      user_email: entry.user_email,
      user_role: entry.user_role,
      activity_type: entry.activity_type,
      description: entry.description,
      contextual_reference: entry.contextual_reference,
    };
    this.activities = [created, ...this.activities];
    return { ...created };
  }

  async listAgents(): Promise<Agent[]> {
    return this.agents.map((agent) => ({ ...agent }));
  }
}
