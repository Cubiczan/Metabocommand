import { NextResponse } from "next/server";
import { z } from "zod";
import { HitlService, SupabaseHitlStore, hitlStatus } from "@/lib/hitl";
import { sendSlackNotification } from "@/lib/slack";
import { getRequestUser } from "@/lib/supabase/request";
import type { ApprovalQueueName } from "@/lib/supabase/types";

const submitSchema = z.object({
  agent_name: z.string().min(1),
  queue: z.enum(["finance", "operations"]),
  action_description: z.string().min(1),
  financial_impact: z.string().min(1),
  impact_amount: z.number().nullable().optional(),
});

export async function POST(request: Request) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== parsed.data.queue) {
    return NextResponse.json({ error: "Role/queue mismatch" }, { status: 403 });
  }

  const appUrl = new URL(request.url).origin;
  const service = new HitlService(new SupabaseHitlStore(supabase), {
    async onSubmitted(item) {
      const { data: slackSettings } = await supabase
        .from("slack_settings")
        .select("webhook_url, enabled")
        .eq("queue", parsed.data.queue)
        .single();

      if (slackSettings?.enabled && slackSettings.webhook_url) {
        const slackResult = await sendSlackNotification(slackSettings.webhook_url, {
          queue: parsed.data.queue,
          agent_name: parsed.data.agent_name,
          action_description: parsed.data.action_description,
          financial_impact: parsed.data.financial_impact,
          approval_item_id: item.id,
          app_url: appUrl,
          event: "submitted",
        });
        if (slackResult.ok) {
          await supabase
            .from("approval_items")
            .update({ slack_notified: true })
            .eq("id", item.id);
        }
      }
    },
  });

  try {
    const inserted = await service.requestApproval({
      agent_name: parsed.data.agent_name,
      queue: parsed.data.queue as ApprovalQueueName,
      action_description: parsed.data.action_description,
      financial_impact: parsed.data.financial_impact,
      impact_amount: parsed.data.impact_amount ?? null,
    });
    return NextResponse.json({ id: inserted.id, item: inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Insert failed";
    return NextResponse.json({ error: message }, { status: hitlStatus(error) });
  }
}
