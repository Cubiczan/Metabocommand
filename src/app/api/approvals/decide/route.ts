import { NextResponse } from "next/server";
import { z } from "zod";
import { HitlService, SupabaseHitlStore, hitlStatus } from "@/lib/hitl";
import { sendSlackNotification } from "@/lib/slack";
import { getRequestUser } from "@/lib/supabase/request";
import type { ApprovalQueueName } from "@/lib/supabase/types";

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, email, role")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const appUrl = new URL(request.url).origin;
  const service = new HitlService(new SupabaseHitlStore(supabase), {
    async onDecided(item, actor, decision) {
      const { data: slackSettings } = await supabase
        .from("slack_settings")
        .select("webhook_url, enabled")
        .eq("queue", item.queue)
        .single();

      if (slackSettings?.enabled && slackSettings.webhook_url) {
        await sendSlackNotification(slackSettings.webhook_url, {
          queue: item.queue,
          agent_name: item.agent_name,
          action_description: item.action_description,
          financial_impact: item.financial_impact,
          approval_item_id: item.id,
          app_url: appUrl,
          event: decision,
          decided_by: `${actor.displayName} (${actor.email})`,
        });
      }
    },
  });

  try {
    const updated = await service.decideApproval({
      id: parsed.data.id,
      decision: parsed.data.decision,
      note: parsed.data.note,
      actor: {
        id: profile.id,
        displayName: profile.display_name,
        email: profile.email,
        role: profile.role as ApprovalQueueName,
      },
    });
    return NextResponse.json({
      ok: true,
      id: updated.id,
      decision: updated.status,
      note: parsed.data.note ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Decide failed";
    return NextResponse.json({ error: message }, { status: hitlStatus(error) });
  }
}
