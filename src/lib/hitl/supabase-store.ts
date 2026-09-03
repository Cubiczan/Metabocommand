import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivityHistoryEntry,
  Agent,
  AgentActionLogEntry,
  ApprovalItem,
} from "@/lib/supabase/types";
import type {
  ActionLogListFilter,
  ApprovalListFilter,
  HitlStore,
  NewActionLogEntry,
  NewActivityEntry,
  NewApprovalItem,
} from "./store";

/**
 * Live store over the same Supabase tables the dashboard uses.
 * Callers must pass a user-scoped client so RLS stays in force.
 */
export class SupabaseHitlStore implements HitlStore {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async listApprovals(filter: ApprovalListFilter = {}): Promise<ApprovalItem[]> {
    let query = this.supabase
      .from("approval_items")
      .select("*")
      .order("status", { ascending: true })
      .order("submitted_at", { ascending: false });
    if (filter.queue) query = query.eq("queue", filter.queue);
    if (filter.status) query = query.eq("status", filter.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as ApprovalItem[];
  }

  async getApproval(id: string): Promise<ApprovalItem | null> {
    const { data, error } = await this.supabase
      .from("approval_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ApprovalItem | null) ?? null;
  }

  async insertApproval(input: NewApprovalItem): Promise<ApprovalItem> {
    const { data, error } = await this.supabase
      .from("approval_items")
      .insert({
        agent_name: input.agent_name,
        queue: input.queue,
        action_description: input.action_description,
        financial_impact: input.financial_impact,
        impact_amount: input.impact_amount,
        status: "pending",
        agent_seniority: input.agent_seniority,
        watchdog_decision: input.watchdog_decision,
        policy_flags: input.policy_flags,
        evidence_packet_id: input.evidence_packet_id,
        evidence_packet: input.evidence_packet,
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Insert failed");
    }
    return data as ApprovalItem;
  }

  async updateApprovalDecision(
    id: string,
    decision: "approved" | "rejected",
    actorId: string,
    decidedAt: string,
  ): Promise<ApprovalItem | null> {
    const { data, error } = await this.supabase
      .from("approval_items")
      .update({
        status: decision,
        decided_at: decidedAt,
        decided_by: actorId,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ApprovalItem | null) ?? null;
  }

  async listActionLog(filter: ActionLogListFilter = {}): Promise<AgentActionLogEntry[]> {
    let query = this.supabase
      .from("agent_action_log")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(filter.limit ?? 500);
    if (filter.queue) query = query.eq("queue", filter.queue);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AgentActionLogEntry[];
  }

  async insertActionLog(entry: NewActionLogEntry): Promise<AgentActionLogEntry> {
    const { data, error } = await this.supabase
      .from("agent_action_log")
      .insert({
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
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Action log insert failed");
    }
    return data as AgentActionLogEntry;
  }

  async insertActivity(entry: NewActivityEntry): Promise<ActivityHistoryEntry | null> {
    const { data, error } = await this.supabase
      .from("activity_history")
      .insert({
        user_id: entry.user_id,
        user_display_name: entry.user_display_name,
        user_email: entry.user_email,
        user_role: entry.user_role,
        activity_type: entry.activity_type,
        description: entry.description,
        contextual_reference: entry.contextual_reference,
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Activity insert failed");
    }
    return data as ActivityHistoryEntry;
  }

  async listAgents(): Promise<Agent[]> {
    const { data, error } = await this.supabase
      .from("agents")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Agent[];
  }
}
