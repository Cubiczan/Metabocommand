import type {
  ActivityHistoryEntry,
  Agent,
  AgentActionLogEntry,
  ApprovalItem,
  ApprovalQueueName,
  ApprovalStatus,
} from "@/lib/supabase/types";

export interface HitlActor {
  id: string;
  displayName: string;
  email: string;
  role: ApprovalQueueName;
}

export interface ApprovalListFilter {
  queue?: ApprovalQueueName;
  status?: ApprovalStatus;
}

export interface ActionLogListFilter {
  queue?: ApprovalQueueName;
  limit?: number;
}

export interface NewApprovalItem {
  agent_name: string;
  queue: ApprovalQueueName;
  action_description: string;
  financial_impact: string;
  impact_amount: number | null;
  agent_seniority: ApprovalItem["agent_seniority"];
  watchdog_decision: ApprovalItem["watchdog_decision"];
  policy_flags: string[];
  evidence_packet_id: string;
  evidence_packet: Record<string, unknown>;
}

export interface NewActionLogEntry {
  agent_name: string;
  queue: ApprovalQueueName;
  action_type: string;
  description: string;
  outcome: string;
  decided_by: string;
  reasoning_summary: string;
  approval_item_id: string | null;
  evidence_packet_id?: string | null;
  policy_flags?: string[] | null;
}

export interface NewActivityEntry {
  user_id: string | null;
  user_display_name: string;
  user_email: string;
  user_role: ApprovalQueueName;
  activity_type: string;
  description: string;
  contextual_reference: string | null;
}

export interface HitlStore {
  listApprovals(filter?: ApprovalListFilter): Promise<ApprovalItem[]>;
  getApproval(id: string): Promise<ApprovalItem | null>;
  insertApproval(item: NewApprovalItem): Promise<ApprovalItem>;
  updateApprovalDecision(
    id: string,
    decision: Extract<ApprovalStatus, "approved" | "rejected">,
    actorId: string,
    decidedAt: string,
  ): Promise<ApprovalItem | null>;
  listActionLog(filter?: ActionLogListFilter): Promise<AgentActionLogEntry[]>;
  insertActionLog(entry: NewActionLogEntry): Promise<AgentActionLogEntry>;
  insertActivity(entry: NewActivityEntry): Promise<ActivityHistoryEntry | null>;
  listAgents(): Promise<Agent[]>;
}
