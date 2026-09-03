import { DEMO_AGENTS } from "../../../src/lib/hitl/fixtures";
import type {
  CapitalReflexSnapshot,
  DecideApprovalInput,
  RequestApprovalInput,
} from "../../../src/lib/hitl/service";
import type {
  AgentActionLogEntry,
  ApprovalItem,
  ApprovalQueueName,
} from "../../../src/lib/supabase/types";

export interface HttpBackendOptions {
  apiUrl: string;
  accessToken: string;
}

/**
 * Live wrap of the existing Next.js approval + action-log routes.
 * Requires `npm run dev` (or a deployed app) and a user JWT.
 */
export class HttpHitlBackend {
  private readonly options: HttpBackendOptions;

  constructor(options: HttpBackendOptions) {
    this.options = options;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.options.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.options.apiUrl}${path}`, {
      ...init,
      headers: {
        ...this.headers(),
        ...(init?.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body.error === "string" ? body.error : response.statusText;
      throw new Error(`${response.status} ${message}`);
    }
    return body as T;
  }

  async listPendingApprovals(filter: { queue?: ApprovalQueueName } = {}): Promise<ApprovalItem[]> {
    const params = new URLSearchParams({ status: "pending" });
    if (filter.queue) params.set("queue", filter.queue);
    const payload = await this.request<{ items: ApprovalItem[] }>(`/api/approvals?${params}`);
    return payload.items;
  }

  async requestApproval(input: RequestApprovalInput): Promise<ApprovalItem> {
    const payload = await this.request<{ id: string; item?: ApprovalItem }>("/api/approvals/submit", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (payload.item) return payload.item;
    return {
      id: payload.id,
      agent_id: "",
      agent_name: input.agent_name,
      queue: input.queue,
      action_description: input.action_description,
      financial_impact: input.financial_impact,
      impact_amount: input.impact_amount ?? null,
      status: "pending",
      submitted_at: new Date().toISOString(),
      decided_at: null,
      decided_by: null,
      slack_notified: false,
    };
  }

  async decideApproval(input: DecideApprovalInput): Promise<ApprovalItem> {
    const payload = await this.request<{ ok: boolean; id: string; decision: string; note?: string | null }>(
      "/api/approvals/decide",
      {
        method: "POST",
        body: JSON.stringify({
          id: input.id,
          decision: input.decision,
          note: input.note,
        }),
      },
    );
    return {
      id: payload.id,
      agent_id: "",
      agent_name: "",
      queue: "finance",
      action_description: "",
      financial_impact: "",
      impact_amount: null,
      status: payload.decision === "rejected" ? "rejected" : "approved",
      submitted_at: new Date().toISOString(),
      decided_at: new Date().toISOString(),
      decided_by: null,
      slack_notified: false,
    };
  }

  async listAgentActionLog(filter: { queue?: ApprovalQueueName; limit?: number } = {}): Promise<AgentActionLogEntry[]> {
    const params = new URLSearchParams();
    if (filter.queue) params.set("queue", filter.queue);
    if (filter.limit) params.set("limit", String(filter.limit));
    const query = params.toString();
    const payload = await this.request<{ records: AgentActionLogEntry[] }>(
      `/api/agent-log${query ? `?${query}` : ""}`,
    );
    return payload.records;
  }

  async listCapitalReflex(): Promise<CapitalReflexSnapshot> {
    const pending_approvals = await this.listPendingApprovals({ queue: "finance" });
    return {
      system: "capital_reflex",
      queue: "finance",
      brand: "Cubiczan",
      spend_gates: {
        package: "@cubiczan/chp-mcp",
        tool: "evaluate_spend_gate",
        note: "Numeric spend/capital gates stay on @cubiczan/chp-mcp. This MCP is the approval-queue surface only.",
      },
      agents: DEMO_AGENTS.filter((agent) => agent.system === "capital_reflex"),
      pending_approvals,
    };
  }
}
