import { NextResponse } from "next/server";
import { z } from "zod";
import { HitlService, SupabaseHitlStore } from "@/lib/hitl";
import { getRequestUser } from "@/lib/supabase/request";
import type { ApprovalQueueName, ApprovalStatus } from "@/lib/supabase/types";

const querySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  queue: z.enum(["finance", "operations"]).optional(),
});

/**
 * Thin list wrap of the same `approval_items` query the Approval Queue page uses.
 * Role-scoped via the user session (cookie or Bearer JWT).
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
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
  const items = await service.listApprovals({
    queue: profile.role as ApprovalQueueName,
    status: parsed.data.status as ApprovalStatus | undefined,
  });

  return NextResponse.json({ items, queue: profile.role });
}
