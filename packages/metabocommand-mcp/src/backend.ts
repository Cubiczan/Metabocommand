import { createDemoHitlService } from "../../../src/lib/hitl/service";
import type { HitlService } from "../../../src/lib/hitl/service";
import type { MetabocommandMcpConfig } from "./config";
import { HttpHitlBackend } from "./http-backend";

export type HitlBackend = HitlService | HttpHitlBackend;

export function createBackend(config: MetabocommandMcpConfig): HitlBackend {
  if (config.mode === "live") {
    if (!config.apiUrl || !config.accessToken) {
      throw new Error("Live mode is missing METABOCOMMAND_API_URL or METABOCOMMAND_ACCESS_TOKEN");
    }
    return new HttpHitlBackend({
      apiUrl: config.apiUrl,
      accessToken: config.accessToken,
    });
  }
  return createDemoHitlService();
}
