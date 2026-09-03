import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabase/request";

const evidenceQuerySchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: Request) {
  const { supabase, user } = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = evidenceQuerySchema.safeParse({ id: url.searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: item, error } = await supabase
    .from("approval_items")
    .select("id, queue, evidence_packet_id, evidence_packet, watchdog_decision, policy_flags")
    .eq("id", parsed.data.id)
    .eq("queue", profile.role)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: "Evidence packet not found" }, { status: 404 });
  }

  return NextResponse.json({
    approval_id: item.id,
    queue: item.queue,
    evidence_packet_id: item.evidence_packet_id,
    watchdog_decision: item.watchdog_decision,
    policy_flags: item.policy_flags,
    evidence_packet: item.evidence_packet,
  });
}
