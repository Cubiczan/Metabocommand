import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeFetch } from "@/lib/resilience";

const testSchema = z.object({
  queue: z.enum(["finance", "operations"]),
  webhook_url: z.string().url(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    // 5s per-attempt timeout + retry/backoff so a hung webhook URL cannot hang
    // the request handler. Network/timeout failures throw and are caught below.
    const res = await safeFetch(parsed.data.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `MetaboCommand test message — ${parsed.data.queue} channel configuration verified`,
      }),
      timeoutMs: 5_000,
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Slack responded ${res.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
