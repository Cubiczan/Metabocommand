import { NextResponse } from "next/server";
import { z } from "zod";
import { HitlService, SupabaseHitlStore } from "@/lib/hitl";
import { getRequestUser } from "@/lib/supabase/request";
import type { ApprovalQueueName } from "@/lib/supabase/types";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  queue: z.enum(["finance", "operations"]).optional(),
});

/**
 * Thin list wrap of the same `agent_action_log` query the Agent Action Log page uses.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    queue: url.searchParams.get("queue") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (parsed.data.queue && parsed.data.queue !== profile.role) {
    return NextResponse.json({ error: "Role/queue mismatch" }, { status: 403 });
  }

  const service = new HitlService(new SupabaseHitlStore(supabase));
  const records = await service.listAgentActionLog({
    queue: profile.role as ApprovalQueueName,
    limit: parsed.data.limit,
  });

  return NextResponse.json({ records, queue: profile.role });
}
