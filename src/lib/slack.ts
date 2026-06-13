import type { ApprovalQueueName } from "./supabase/types";
import { safeFetch } from "./resilience";

export interface SlackNotificationPayload {
  queue: ApprovalQueueName;
  agent_name: string;
  action_description: string;
  financial_impact: string;
  approval_item_id: string;
  app_url: string;
  event: "submitted" | "approved" | "rejected";
  decided_by?: string;
}

export async function sendSlackNotification(
  webhookUrl: string,
  payload: SlackNotificationPayload
): Promise<{ ok: boolean; error?: string }> {
  const { event, agent_name, action_description, financial_impact, approval_item_id, app_url, decided_by, queue } = payload;

  const header =
    event === "submitted"
      ? `New approval request — ${agent_name}`
      : event === "approved"
      ? `Approved — ${agent_name}`
      : `Rejected — ${agent_name}`;

  const deepLink = `${app_url}/approvals#${approval_item_id}`;

  const slackMessage = {
    text: header,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: header },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Queue*\n${queue}` },
          { type: "mrkdwn", text: `*Impact*\n${financial_impact}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Action*\n${action_description}` },
      },
      ...(decided_by
        ? [
            {
              type: "context",
              elements: [
                { type: "mrkdwn", text: `Decided by ${decided_by}` },
              ],
            },
          ]
        : []),
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open in MetaboCommand" },
            url: deepLink,
          },
        ],
      },
    ],
  };

  try {
    // 5s per-attempt timeout + retry/backoff so a hung webhook endpoint can
    // never block the approval write path. safeFetch throws on network/timeout
    // (caught below) rather than hanging on a bare fetch.
    const res = await safeFetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage),
      timeoutMs: 5_000,
    });
    if (!res.ok) {
      return { ok: false, error: `Slack responded ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
