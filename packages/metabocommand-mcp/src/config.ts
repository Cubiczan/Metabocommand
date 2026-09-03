export type MetabocommandMode = "demo" | "live";

export interface MetabocommandMcpConfig {
  mode: MetabocommandMode;
  apiUrl: string | null;
  accessToken: string | null;
  defaultQueue: "finance" | "operations" | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MetabocommandMcpConfig {
  const mode = env.METABOCOMMAND_MODE === "live" ? "live" : "demo";
  const apiUrl = env.METABOCOMMAND_API_URL?.replace(/\/$/, "") || null;
  const accessToken = env.METABOCOMMAND_ACCESS_TOKEN || null;
  const queue = env.METABOCOMMAND_QUEUE;
  const defaultQueue = queue === "finance" || queue === "operations" ? queue : null;

  if (mode === "live" && !apiUrl) {
    throw new Error(
      "METABOCOMMAND_MODE=live requires METABOCOMMAND_API_URL (running Next.js app). " +
        "Use METABOCOMMAND_MODE=demo for the seed-fixture path that needs no server.",
    );
  }
  if (mode === "live" && !accessToken) {
    throw new Error(
      "METABOCOMMAND_MODE=live requires METABOCOMMAND_ACCESS_TOKEN (Supabase user JWT). " +
        "The dashboard APIs stay RLS-scoped; this MCP does not use the service role.",
    );
  }

  return { mode, apiUrl, accessToken, defaultQueue };
}
