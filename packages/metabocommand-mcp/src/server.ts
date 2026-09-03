/**
 * Cubiczan Metabocommand MCP server — thin transport over the product HITL
 * service (approval queue + agent action log). CHP is the lock; MCP is the pipe.
 *
 * Spend/capital numeric gates stay on @cubiczan/chp-mcp (evaluate_spend_gate).
 * This server does not duplicate that tool.
 */

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createBackend, type HitlBackend } from "./backend";
import { loadConfig, type MetabocommandMcpConfig } from "./config";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../package.json") as { version: string };

function jsonContent(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorContent(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

const queueSchema = z.enum(["finance", "operations"]);

export function createServer(
  backend?: HitlBackend,
  config: MetabocommandMcpConfig = loadConfig(),
): McpServer {
  const hitl = backend ?? createBackend(config);

  const server = new McpServer({
    name: "metabocommand-mcp",
    version: PKG_VERSION,
  });

  server.tool(
    "list_pending_approvals",
    "List pending Metabocommand approval-queue items (Capital Reflex finance " +
      "and/or operations). Wraps the same approval_items query as the dashboard.",
    {
      queue: queueSchema.optional().describe("Limit to finance or operations. Demo lists both when omitted."),
    },
    async ({ queue }) => {
      try {
        const items = await hitl.listPendingApprovals({ queue: queue ?? config.defaultQueue ?? undefined });
        return jsonContent({
          mode: config.mode,
          count: items.length,
          items,
        });
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "request_approval",
    "Queue a proposed agent action for human approval. Wraps POST /api/approvals/submit " +
      "and buildEvidencePacket — does not execute the action.",
    {
      agent_name: z.string().min(1).describe("Product agent name, e.g. Pulse Agent or Conductor Agent"),
      queue: queueSchema.describe("finance (Capital Reflex) or operations"),
      action_description: z.string().min(1).describe("Proposed action"),
      financial_impact: z.string().min(1).describe("Human-readable impact, e.g. +$18,500 reallocation"),
      impact_amount: z.number().nullable().optional().describe("Signed dollar amount when known"),
    },
    async (input) => {
      try {
        const item = await hitl.requestApproval(input);
        return jsonContent({ item });
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "decide_approval",
    "Approve or reject a pending queue item with an optional note. Wraps " +
      "POST /api/approvals/decide. Already-decided items return a conflict.",
    {
      id: z.string().uuid().describe("approval_items.id"),
      decision: z.enum(["approved", "rejected"]),
      note: z.string().min(1).optional().describe("Human rationale recorded on the agent action log"),
    },
    async (input) => {
      try {
        const item = await hitl.decideApproval(input);
        return jsonContent({ item, note: input.note ?? null });
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "list_agent_action_log",
    "Read the Metabocommand agent action log (proposals, decisions, auto-executes). " +
      "Wraps the same agent_action_log query as the dashboard.",
    {
      queue: queueSchema.optional(),
      limit: z.number().int().min(1).max(500).optional(),
    },
    async ({ queue, limit }) => {
      try {
        const records = await hitl.listAgentActionLog({
          queue: queue ?? config.defaultQueue ?? undefined,
          limit,
        });
        return jsonContent({
          mode: config.mode,
          count: records.length,
          records,
        });
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "list_capital_reflex",
    "Capital Reflex HITL snapshot: finance-queue pending items plus the Pulse / " +
      "Oracle / Sniper / Conductor agents. Numeric spend gates are NOT evaluated here — " +
      "call evaluate_spend_gate on @cubiczan/chp-mcp.",
    {},
    async () => {
      try {
        return jsonContent(await hitl.listCapitalReflex());
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "metabocommand_version",
    "Report MCP package version, brand, and the CHP spend-gate package to use for numeric gates.",
    {},
    async () =>
      jsonContent({
        mcp: `@cubiczan/metabocommand-mcp@${PKG_VERSION}`,
        brand: "Cubiczan",
        product: "Metabocommand",
        mode: config.mode,
        role: "approval-queue HITL pipe",
        spend_gates: {
          package: "@cubiczan/chp-mcp",
          tool: "evaluate_spend_gate",
          install: "npx -y @cubiczan/chp-mcp",
        },
      }),
  );

  return server;
}
