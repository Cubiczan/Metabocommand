/**
 * HITL service wraps the existing approval-queue + action-log rules
 * against seed-derived demo fixtures (no Supabase, no Next.js server).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_APPROVAL_IDS } from "@/lib/hitl/fixtures";
import { HitlError } from "@/lib/hitl/errors";
import { createDemoHitlService } from "@/lib/hitl/service";

test("lists pending approvals from the product seed set", async () => {
  const hitl = createDemoHitlService();
  const pending = await hitl.listPendingApprovals();
  assert.ok(pending.length >= 10);
  assert.ok(pending.every((item) => item.status === "pending"));
  assert.ok(pending.some((item) => item.id === DEMO_APPROVAL_IDS.conductorRealloc));
  assert.ok(pending.some((item) => item.queue === "finance" && item.agent_name === "Oracle Agent"));
});

test("requestApproval uses buildEvidencePacket and stays pending", async () => {
  const hitl = createDemoHitlService();
  const item = await hitl.requestApproval({
    agent_name: "Pulse Agent",
    queue: "finance",
    action_description: "Hold $3,200 Meta Ads spend pending velocity review",
    financial_impact: "$3,200 hold",
    impact_amount: 3200,
  });
  assert.equal(item.status, "pending");
  assert.ok(item.evidence_packet_id?.startsWith("evp_finance_pulse-agent_"));
  assert.equal(item.watchdog_decision, "approval_required");

  const pending = await hitl.listPendingApprovals({ queue: "finance" });
  assert.ok(pending.some((row) => row.id === item.id));

  const log = await hitl.listAgentActionLog({ queue: "finance" });
  assert.ok(log.some((row) => row.approval_item_id === item.id && row.action_type === "Proposal Submitted"));
});

test("decideApproval records a note on the action log and rejects a second decide", async () => {
  const hitl = createDemoHitlService();
  const updated = await hitl.decideApproval({
    id: DEMO_APPROVAL_IDS.pulseFreight,
    decision: "rejected",
    note: "Carrier contract already in legal review.",
  });
  assert.equal(updated.status, "rejected");

  const log = await hitl.listAgentActionLog({ queue: "finance" });
  const decision = log.find(
    (row) => row.approval_item_id === DEMO_APPROVAL_IDS.pulseFreight && row.action_type === "Decision",
  );
  assert.ok(decision);
  assert.match(decision.reasoning_summary, /Carrier contract already in legal review/);

  await assert.rejects(
    () => hitl.decideApproval({ id: DEMO_APPROVAL_IDS.pulseFreight, decision: "approved" }),
    (error: unknown) => error instanceof HitlError && error.code === "ALREADY_DECIDED",
  );
});

test("listCapitalReflex points spend gates at @cubiczan/chp-mcp", async () => {
  const hitl = createDemoHitlService();
  const snapshot = await hitl.listCapitalReflex();
  assert.equal(snapshot.brand, "Cubiczan");
  assert.equal(snapshot.spend_gates.package, "@cubiczan/chp-mcp");
  assert.equal(snapshot.spend_gates.tool, "evaluate_spend_gate");
  assert.ok(snapshot.agents.some((agent) => agent.name === "Pulse Agent"));
  assert.ok(snapshot.pending_approvals.every((item) => item.queue === "finance" && item.status === "pending"));
});
