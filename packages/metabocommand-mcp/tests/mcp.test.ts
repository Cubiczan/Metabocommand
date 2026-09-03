import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DEMO_APPROVAL_IDS } from "../../../src/lib/hitl/fixtures";
import { createDemoHitlService } from "../../../src/lib/hitl/service";
import { loadConfig } from "../src/config";
import { createServer } from "../src/server";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const demoConfig = {
  mode: "demo" as const,
  apiUrl: null,
  accessToken: null,
  defaultQueue: null,
};

const expectedTools = [
  "list_pending_approvals",
  "request_approval",
  "decide_approval",
  "list_agent_action_log",
  "list_capital_reflex",
  "metabocommand_version",
];

async function connectDemoClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(createDemoHitlService(), demoConfig);
  await server.connect(serverTransport);
  const client = new Client({ name: "metabocommand-mcp-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

function parseToolJson(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find((part) => part.type === "text")?.text;
  assert.ok(text, "expected text content");
  return JSON.parse(text) as Record<string, unknown>;
}

test("tools/list exposes HITL approval and action-log tools", async () => {
  const { client, server } = await connectDemoClient();
  try {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    for (const name of expectedTools) {
      assert.ok(names.includes(name), `missing tool ${name}`);
    }
    assert.ok(!names.includes("evaluate_spend_gate"), "must not duplicate CHP spend gates");
  } finally {
    await client.close();
    await server.close();
  }
});

test("list_pending_approvals returns seed-derived demo queue", async () => {
  const { client, server } = await connectDemoClient();
  try {
    const result = await client.callTool({ name: "list_pending_approvals", arguments: {} });
    const payload = parseToolJson(result);
    assert.equal(payload.mode, "demo");
    const items = payload.items as Array<{ id: string; status: string; agent_name: string; queue: string }>;
    assert.ok(items.length >= 10, `expected seed pending items, got ${items.length}`);
    assert.ok(items.every((item) => item.status === "pending"));
    assert.ok(items.some((item) => item.id === DEMO_APPROVAL_IDS.conductorRealloc));
    assert.ok(items.some((item) => item.agent_name === "Pulse Agent" && item.queue === "finance"));
  } finally {
    await client.close();
    await server.close();
  }
});

test("decide_approval approves a fixture item with a note", async () => {
  const { client, server } = await connectDemoClient();
  try {
    const decided = await client.callTool({
      name: "decide_approval",
      arguments: {
        id: DEMO_APPROVAL_IDS.sniperKlaviyo,
        decision: "approved",
        note: "CFO accepted cancellation after velocity review.",
      },
    });
    const decisionPayload = parseToolJson(decided);
    const item = decisionPayload.item as { id: string; status: string };
    assert.equal(item.id, DEMO_APPROVAL_IDS.sniperKlaviyo);
    assert.equal(item.status, "approved");
    assert.equal(decisionPayload.note, "CFO accepted cancellation after velocity review.");

    const pending = parseToolJson(
      await client.callTool({ name: "list_pending_approvals", arguments: { queue: "finance" } }),
    );
    const pendingItems = pending.items as Array<{ id: string }>;
    assert.ok(!pendingItems.some((row) => row.id === DEMO_APPROVAL_IDS.sniperKlaviyo));

    const log = parseToolJson(await client.callTool({ name: "list_agent_action_log", arguments: { queue: "finance" } }));
    const records = log.records as Array<{ action_type: string; reasoning_summary: string; approval_item_id: string | null }>;
    const decisionRow = records.find(
      (row) => row.action_type === "Decision" && row.approval_item_id === DEMO_APPROVAL_IDS.sniperKlaviyo,
    );
    assert.ok(decisionRow, "expected Decision row on the action log");
    assert.match(decisionRow.reasoning_summary, /CFO accepted cancellation after velocity review/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("stdio MCP starts and answers tools/list", async () => {
  const transportModule = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new transportModule.StdioClientTransport({
    command: process.execPath,
    args: [resolve(packageRoot, "dist/index.js")],
    env: {
      ...process.env,
      METABOCOMMAND_MODE: "demo",
      METABOCOMMAND_API_URL: "",
      METABOCOMMAND_ACCESS_TOKEN: "",
    },
  });
  const client = new Client({ name: "metabocommand-mcp-stdio-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    assert.ok(names.includes("list_pending_approvals"));
    assert.ok(names.includes("list_agent_action_log"));
  } finally {
    await client.close();
  }
});

test("live mode without API URL fails closed", () => {
  assert.throws(
    () => loadConfig({ METABOCOMMAND_MODE: "live" }),
    /METABOCOMMAND_API_URL/,
  );
});
