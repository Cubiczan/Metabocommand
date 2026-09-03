import { createClient as createJsClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "./server";

/**
 * Resolve a user-scoped Supabase client from a Request.
 * Cookie session (browser) or `Authorization: Bearer <user jwt>` (MCP / CLI).
 * Always uses the anon key so RLS stays in force.
 */
export async function createRequestClient(request: Request) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    return createJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }
  return createCookieClient();
}

export async function getRequestUser(request: Request) {
  const supabase = await createRequestClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { supabase, user, error };
}
