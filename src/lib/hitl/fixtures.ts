import type { Agent, AgentActionLogEntry, ApprovalItem } from "@/lib/supabase/types";
import type { HitlActor } from "./store";

export const DEMO_ACTORS: Record<"finance" | "operations", HitlActor> = {
  finance: {
    id: "a0000000-0000-4000-8000-000000000001",
    displayName: "Sarah Chen",
    email: "sarah.chen@metabo.io",
    role: "finance",
  },
  operations: {
    id: "a0000000-0000-4000-8000-000000000002",
    displayName: "James Okafor",
    email: "james.okafor@metabo.io",
    role: "operations",
  },
};

export const DEMO_AGENTS: Agent[] = [
  { id: "b0000000-0000-4000-8000-000000000001", name: "Pulse Agent", slug: "pulse", system: "capital_reflex", queue: "finance", is_active: true, autonomous_limit: null, approval_required_above: 0, seniority: "professional" },
  { id: "b0000000-0000-4000-8000-000000000002", name: "Oracle Agent", slug: "oracle", system: "capital_reflex", queue: "finance", is_active: true, autonomous_limit: null, approval_required_above: 0, seniority: "professional" },
  { id: "b0000000-0000-4000-8000-000000000003", name: "Sniper Agent", slug: "sniper", system: "capital_reflex", queue: "finance", is_active: true, autonomous_limit: 500, approval_required_above: 500, seniority: "professional" },
  { id: "b0000000-0000-4000-8000-000000000004", name: "Conductor Agent", slug: "conductor", system: "capital_reflex", queue: "finance", is_active: true, autonomous_limit: null, approval_required_above: 0, seniority: "senior_professional" },
  { id: "b0000000-0000-4000-8000-000000000005", name: "Acquisition Agent", slug: "acquisition", system: "revenue_velocity", queue: "operations", is_active: true, autonomous_limit: 500, approval_required_above: 500, seniority: "professional" },
  { id: "b0000000-0000-4000-8000-000000000006", name: "Conversion Agent", slug: "conversion", system: "revenue_velocity", queue: "operations", is_active: true, autonomous_limit: null, approval_required_above: 0, seniority: "professional" },
  { id: "b0000000-0000-4000-8000-000000000007", name: "Retention Agent", slug: "retention", system: "revenue_velocity", queue: "operations", is_active: true, autonomous_limit: null, approval_required_above: 0, seniority: "professional" },
  { id: "b0000000-0000-4000-8000-000000000008", name: "Demand Prophet Agent", slug: "demand-prophet", system: "inventory_intelligence", queue: "operations", is_active: true, autonomous_limit: 10_000, approval_required_above: 10_000, seniority: "professional" },
  { id: "b0000000-0000-4000-8000-000000000009", name: "Logistics Conductor Agent", slug: "logistics-conductor", system: "inventory_intelligence", queue: "operations", is_active: true, autonomous_limit: null, approval_required_above: 0, seniority: "professional" },
  { id: "b0000000-0000-4000-8000-00000000000a", name: "Support Reflex Agent", slug: "support-reflex", system: "customer_lifetime", queue: "operations", is_active: true, autonomous_limit: 35, approval_required_above: 35, seniority: "professional" },
  { id: "b0000000-0000-4000-8000-00000000000b", name: "Advocacy Agent", slug: "advocacy", system: "customer_lifetime", queue: "operations", is_active: true, autonomous_limit: null, approval_required_above: 0, seniority: "junior" },
  { id: "b0000000-0000-4000-8000-00000000000c", name: "Harmony Agent", slug: "harmony", system: "operational_health", queue: "operations", is_active: true, autonomous_limit: null, approval_required_above: 0, seniority: "senior_professional" },
];

/** Stable ids for the seed-derived demo queue (supabase/migrations/0002_seed.sql). */
export const DEMO_APPROVAL_IDS = {
  conductorRealloc: "c1000000-0000-4000-8000-000000000001",
  oracleScenarioB: "c1000000-0000-4000-8000-000000000002",
  sniperKlaviyo: "c1000000-0000-4000-8000-000000000003",
  pulseFreight: "c1000000-0000-4000-8000-000000000004",
  conductorInfluencerApproved: "c1000000-0000-4000-8000-000000000005",
  sniperSalesforceRejected: "c1000000-0000-4000-8000-000000000006",
  demandProphetPo: "c1000000-0000-4000-8000-000000000007",
  acquisitionRealloc: "c1000000-0000-4000-8000-000000000008",
  retentionWinback: "c1000000-0000-4000-8000-000000000009",
  logisticsCarrier: "c1000000-0000-4000-8000-00000000000a",
  supportReturns: "c1000000-0000-4000-8000-00000000000b",
  harmonyConflict: "c1000000-0000-4000-8000-00000000000c",
  demandProphetApproved: "c1000000-0000-4000-8000-00000000000d",
  conversionApproved: "c1000000-0000-4000-8000-00000000000e",
} as const;

function item(
  id: string,
  agent_name: string,
  queue: ApprovalItem["queue"],
  action_description: string,
  financial_impact: string,
  impact_amount: number | null,
  status: ApprovalItem["status"],
  submitted_at: string,
  decided_at: string | null,
): ApprovalItem {
  const agent = DEMO_AGENTS.find((candidate) => candidate.name === agent_name);
  return {
    id,
    agent_id: agent?.id ?? "",
    agent_name,
    queue,
    action_description,
    financial_impact,
    impact_amount,
    status,
    submitted_at,
    decided_at,
    decided_by: decided_at
      ? (queue === "finance" ? DEMO_ACTORS.finance.id : DEMO_ACTORS.operations.id)
      : null,
    slack_notified: true,
  };
}

export const DEMO_APPROVALS: ApprovalItem[] = [
  item(DEMO_APPROVAL_IDS.conductorRealloc, "Conductor Agent", "finance", "Reallocate $18,500 from Google Ads (low velocity, score 0.42) to TikTok Ads (high velocity, score 1.87)", "+$18,500 reallocation", 18500, "pending", "2026-04-14T09:15:00.000Z", null),
  item(DEMO_APPROVAL_IDS.oracleScenarioB, "Oracle Agent", "finance", "Approve Scenario B: Pre-purchase $240,000 inventory ahead of Q3 demand spike (probability 74%, break-even 38 days)", "$240,000 capital commitment", 240000, "pending", "2026-04-14T11:42:00.000Z", null),
  item(DEMO_APPROVAL_IDS.sniperKlaviyo, "Sniper Agent", "finance", "Cancel Klaviyo Pro subscription ($1,200/month) — velocity score 0.18, LTV contribution below threshold", "-$1,200/month", -1200, "pending", "2026-04-13T16:30:00.000Z", null),
  item(DEMO_APPROVAL_IDS.pulseFreight, "Pulse Agent", "finance", "Intervene on margin erosion: renegotiate freight contract with Carrier Delta (shipping cost spike +34% over 14 days, velocity impact -0.61)", "Est. -$9,200/month if unaddressed", -9200, "pending", "2026-04-13T08:05:00.000Z", null),
  item(DEMO_APPROVAL_IDS.conductorInfluencerApproved, "Conductor Agent", "finance", "Pause capital deployment to Influencer Program Alpha pending LTV recalculation (current velocity score 0.29, below 0.50 threshold)", "$6,000/month hold", 6000, "approved", "2026-04-12T14:20:00.000Z", "2026-04-12T14:22:00.000Z"),
  item(DEMO_APPROVAL_IDS.sniperSalesforceRejected, "Sniper Agent", "finance", "Renegotiate Salesforce CRM contract ($3,800/month) — projected savings $1,140/month at revised tier", "-$1,140/month projected savings", -1140, "rejected", "2026-04-11T10:55:00.000Z", "2026-04-11T11:00:00.000Z"),
  item(DEMO_APPROVAL_IDS.demandProphetPo, "Demand Prophet Agent", "operations", "Issue PO to Vendor Apex: 4,200 units SKU-0091 (Wireless Earbuds Pro) — stockout risk in 11 days, estimated cost $58,800", "Prevents stockout, 11-day lead time", 58800, "pending", "2026-04-14T10:30:00.000Z", null),
  item(DEMO_APPROVAL_IDS.acquisitionRealloc, "Acquisition Agent", "operations", "Reallocate $7,500/month from Facebook Ads (LTV:CAC 1.2) to Google Shopping (LTV:CAC 3.1) — projected CAC reduction 28%", "+$7,500 channel shift", 7500, "pending", "2026-04-14T08:55:00.000Z", null),
  item(DEMO_APPROVAL_IDS.retentionWinback, "Retention Agent", "operations", "Launch win-back campaign for High-Value Lapsed segment (2,340 customers, churn probability 71%) — 20% discount offer, projected reactivation rate 18%", "Est. $41,200 recovered revenue", 41200, "pending", "2026-04-13T15:10:00.000Z", null),
  item(DEMO_APPROVAL_IDS.logisticsCarrier, "Logistics Conductor Agent", "operations", "Switch 40% of West Coast shipments from Carrier Bravo to Carrier Echo — projected delivery cost reduction $1.82/order, on-time rate improvement +9%", "-$1.82/order on 40% of volume", null, "pending", "2026-04-13T12:45:00.000Z", null),
  item(DEMO_APPROVAL_IDS.supportReturns, "Support Reflex Agent", "operations", "Implement automated returns pre-approval for orders under $35 — reduces avg resolution time from 18h to 2h for 44% of return inquiries", "Affects ~620 tickets/month", null, "pending", "2026-04-12T17:20:00.000Z", null),
  item(DEMO_APPROVAL_IDS.harmonyConflict, "Harmony Agent", "operations", "Resolve conflict: pause Acquisition Agent spend increase on Meta Ads pending Sniper Agent waste review of same channel (conflicting actions detected 2026-04-12)", "Blocks $4,200 spend increase", 4200, "pending", "2026-04-12T09:00:00.000Z", null),
  item(DEMO_APPROVAL_IDS.demandProphetApproved, "Demand Prophet Agent", "operations", "Issue PO to Vendor Meridian: 1,800 units SKU-0047 (Portable Charger 20K) — seasonal demand uplift forecast +62% in next 21 days, estimated cost $21,600", "Prevents projected stockout", 21600, "approved", "2026-04-11T11:30:00.000Z", "2026-04-11T11:35:00.000Z"),
  item(DEMO_APPROVAL_IDS.conversionApproved, "Conversion Agent", "operations", "Roll out Variant B of checkout flow redesign to 100% of traffic — A/B test result: +14.3% conversion lift, 95% confidence, 12-day test duration", "+14.3% conversion lift", null, "approved", "2026-04-10T16:45:00.000Z", "2026-04-10T16:50:00.000Z"),
];

function log(
  id: string,
  timestamp: string,
  agent_name: string,
  queue: AgentActionLogEntry["queue"],
  action_type: string,
  description: string,
  outcome: string,
  decided_by: string,
  reasoning_summary: string,
  approval_item_id: string | null,
): AgentActionLogEntry {
  return {
    id,
    timestamp,
    agent_name,
    queue,
    action_type,
    description,
    outcome,
    decided_by,
    reasoning_summary,
    approval_item_id,
  };
}

export const DEMO_ACTION_LOG: AgentActionLogEntry[] = [
  log("d1000000-0000-4000-8000-000000000001", "2026-04-14T09:15:00.000Z", "Conductor Agent", "finance", "Reallocation Proposal", "Proposed $18,500 reallocation from Google Ads to TikTok Ads", "Pending Approval", "—", "Velocity score differential 1.45; TikTok cohort LTV 2.3× Google cohort over 60-day window", DEMO_APPROVAL_IDS.conductorRealloc),
  log("d1000000-0000-4000-8000-000000000002", "2026-04-14T11:42:00.000Z", "Oracle Agent", "finance", "Scenario Submission", "Submitted Scenario B for approval: $240,000 pre-purchase inventory commitment", "Pending Approval", "—", "74% probability weighted; break-even modeled at 38 days under base demand assumptions", DEMO_APPROVAL_IDS.oracleScenarioB),
  log("d1000000-0000-4000-8000-000000000003", "2026-04-13T16:30:00.000Z", "Sniper Agent", "finance", "Subscription Cancellation Proposal", "Flagged Klaviyo Pro ($1,200/month) for cancellation — velocity score 0.18", "Pending Approval", "—", "LTV contribution $0.09 per $1 deployed over trailing 90 days; below 0.30 minimum threshold", DEMO_APPROVAL_IDS.sniperKlaviyo),
  log("d1000000-0000-4000-8000-000000000004", "2026-04-13T08:05:00.000Z", "Pulse Agent", "finance", "Anomaly Escalation", "Escalated freight cost anomaly: Carrier Delta +34% over 14 days", "Pending Approval", "—", "Correlated with margin erosion on SKU-0091 and SKU-0047; velocity impact score -0.61", DEMO_APPROVAL_IDS.pulseFreight),
  log("d1000000-0000-4000-8000-000000000005", "2026-04-12T14:20:00.000Z", "Conductor Agent", "finance", "Capital Hold", "Paused capital deployment to Influencer Program Alpha", "Approved", "CFO (sarah.chen@metabo.io)", "Velocity score 0.29 below 0.50 floor; LTV recalculation pending new cohort data", DEMO_APPROVAL_IDS.conductorInfluencerApproved),
  log("d1000000-0000-4000-8000-000000000006", "2026-04-11T10:55:00.000Z", "Sniper Agent", "finance", "Contract Renegotiation Proposal", "Proposed Salesforce CRM renegotiation ($3,800/month → $2,660/month)", "Rejected", "CFO (sarah.chen@metabo.io)", "CRM consolidation project in progress; renegotiation deferred to Q3 contract renewal window", DEMO_APPROVAL_IDS.sniperSalesforceRejected),
  log("d1000000-0000-4000-8000-000000000007", "2026-04-10T07:30:00.000Z", "Sniper Agent", "finance", "Auto-Execute", "Cancelled Zapier Starter plan ($49/month) — velocity score 0.11, no active workflow dependencies detected", "Auto-Executed", "Autonomous", "Monthly cost below $500 autonomous threshold; zero LTV contribution over trailing 60 days", null),
  log("d1000000-0000-4000-8000-000000000008", "2026-04-09T14:15:00.000Z", "Sniper Agent", "finance", "Auto-Execute", "Cancelled redundant Loom Business seat ($12.50/month) — duplicate seat, zero usage in 45 days", "Auto-Executed", "Autonomous", "Monthly cost below $500 autonomous threshold; usage data confirmed zero sessions", null),
  log("d1000000-0000-4000-8000-000000000009", "2026-04-08T11:00:00.000Z", "Pulse Agent", "finance", "Anomaly Resolved", "Margin erosion on Vendor Bravo resolved after renegotiation confirmed", "Resolved", "CFO (sarah.chen@metabo.io)", "Vendor confirmed revised pricing effective 2026-04-08; margin restored to 38% baseline", null),
  log("d1000000-0000-4000-8000-00000000000a", "2026-04-07T09:45:00.000Z", "Oracle Agent", "finance", "Scenario Closed", "Scenario A (conservative Q2 hold) closed — probability dropped below 15% threshold", "Auto-Closed", "Autonomous", "Demand signals updated; scenario probability fell from 41% to 12% over 7-day window", null),
  log("d1000000-0000-4000-8000-00000000000b", "2026-04-14T10:30:00.000Z", "Demand Prophet Agent", "operations", "Purchase Order Proposal", "Proposed PO: 4,200 units SKU-0091 from Vendor Apex ($58,800)", "Pending Approval", "—", "Stockout risk in 11 days at current sell-through rate; reorder point breached 3 days ago", DEMO_APPROVAL_IDS.demandProphetPo),
  log("d1000000-0000-4000-8000-00000000000c", "2026-04-14T08:55:00.000Z", "Acquisition Agent", "operations", "Spend Reallocation Proposal", "Proposed $7,500/month shift from Facebook Ads to Google Shopping", "Pending Approval", "—", "LTV:CAC ratio 3.1 vs 1.2; 28% projected CAC reduction based on 60-day cohort comparison", DEMO_APPROVAL_IDS.acquisitionRealloc),
  log("d1000000-0000-4000-8000-00000000000d", "2026-04-13T15:10:00.000Z", "Retention Agent", "operations", "Campaign Proposal", "Win-back campaign for High-Value Lapsed segment (2,340 customers)", "Pending Approval", "—", "Churn probability 71%; 20% discount offer modeled at 18% reactivation, $41,200 recovered revenue", DEMO_APPROVAL_IDS.retentionWinback),
  log("d1000000-0000-4000-8000-00000000000e", "2026-04-13T12:45:00.000Z", "Logistics Conductor Agent", "operations", "Route Optimization Proposal", "Shift 40% West Coast volume from Carrier Bravo to Carrier Echo", "Pending Approval", "—", "Carrier Echo on-time rate 96.2% vs Bravo 87.4%; cost delta -$1.82/order on shifted volume", DEMO_APPROVAL_IDS.logisticsCarrier),
  log("d1000000-0000-4000-8000-00000000000f", "2026-04-12T17:20:00.000Z", "Support Reflex Agent", "operations", "Process Improvement Proposal", "Automated returns pre-approval for orders under $35", "Pending Approval", "—", "44% of return tickets qualify; resolution time reduction from 18h to 2h modeled on historical volume", DEMO_APPROVAL_IDS.supportReturns),
  log("d1000000-0000-4000-8000-000000000010", "2026-04-12T09:00:00.000Z", "Harmony Agent", "operations", "Conflict Resolution Proposal", "Paused Acquisition Agent Meta Ads spend increase pending Sniper review", "Pending Approval", "—", "Conflicting directives detected: Acquisition +$4,200 vs Sniper waste flag on same channel", DEMO_APPROVAL_IDS.harmonyConflict),
  log("d1000000-0000-4000-8000-000000000011", "2026-04-11T11:30:00.000Z", "Demand Prophet Agent", "operations", "Purchase Order Approved", "PO issued: 1,800 units SKU-0047 from Vendor Meridian ($21,600)", "Approved", "Ops Lead (james.okafor@metabo.io)", "Seasonal uplift forecast +62%; approved within 48h of submission", DEMO_APPROVAL_IDS.demandProphetApproved),
  log("d1000000-0000-4000-8000-000000000012", "2026-04-10T16:45:00.000Z", "Conversion Agent", "operations", "A/B Test Rollout Approved", "Variant B checkout redesign rolled out to 100% traffic", "Approved", "Ops Lead (james.okafor@metabo.io)", "+14.3% conversion lift at 95% confidence over 12-day test; above auto-rollout threshold", DEMO_APPROVAL_IDS.conversionApproved),
  log("d1000000-0000-4000-8000-000000000013", "2026-04-09T13:20:00.000Z", "Demand Prophet Agent", "operations", "Auto-Execute", "Auto-issued PO: 320 units SKU-0112 (USB-C Hub) from Vendor Nexus ($4,480)", "Auto-Executed", "Autonomous", "PO value $4,480 within $10,000 autonomous threshold; stockout risk confirmed within 7 days", null),
  log("d1000000-0000-4000-8000-000000000014", "2026-04-08T10:05:00.000Z", "Acquisition Agent", "operations", "Auto-Execute", "Paused Google Display campaign (velocity score 0.14, spend $380/month)", "Auto-Executed", "Autonomous", "Monthly spend below $500 autonomous threshold; LTV:CAC ratio 0.8 over trailing 30 days", null),
  log("d1000000-0000-4000-8000-000000000015", "2026-04-07T15:50:00.000Z", "Harmony Agent", "operations", "Mode Change Logged", "Operating mode switched from Efficiency to Growth", "Logged", "Ops Lead (james.okafor@metabo.io)", "Q2 growth sprint initiated; mode change confirmed via modal by authorized user", null),
  log("d1000000-0000-4000-8000-000000000016", "2026-04-06T09:30:00.000Z", "Support Reflex Agent", "operations", "Issue Pattern Detected", "Recurring shipping delay complaints: 340 tickets in 7 days linked to Carrier Bravo West Coast routes", "Logged", "Autonomous", "Pattern frequency threshold exceeded; escalated to Logistics Conductor for route review", null),
];
