# MetaboCommand — approval queue: Lean 4 verification notes

**Model:** `ApprovalQueue.lean` (this directory) — self-contained Lean 4.34.1,
core library only, no Mathlib. **55 theorems + 4 exhibits.**
**Check:** `~/.elan/bin/lean ApprovalQueue.lean` → exit 0, no errors.
**Axiom audit** (in-file, §11): every headline theorem depends only on
`[propext]` — no `sorry`/`admit`, no custom axioms, not even
`Classical.choice`. No source files were modified.

## What the repo actually is

Not UI-only. A Next.js app over Supabase (Postgres + RLS), a Rust governance
kernel, and a standalone MCP server — three separate write paths into one table:

| Component | Source |
|---|---|
| Approval table `approval_items` (status enum pending/approved/rejected, `decided_by uuid`, **no submitter column**) | `supabase/migrations/0001_schema.sql` ll. 71–88 |
| RLS policies for the table (read + update only; no insert policy) | `0001_schema.sql` ll. 184–192 |
| Watchdog kernel: per-agent profiles, amount extraction, policy flags, `assess_governance_action`, evidence packets | `crates/metabocommand-kernel/src/governance.rs` ll. 132–522 |
| REST submit (auth + role = queue; watchdog packet stored; always inserts as `pending`) | `src/app/api/approvals/submit/route.ts` ll. 33, 37, 45–64 |
| REST decide (queue-filtered fetch, TS pending check, CAS update, then log/Slack side effects) | `src/app/api/approvals/decide/route.ts` ll. 35–56, 57–105 |
| MCP server (built on `SUPABASE_SERVICE_ROLE_KEY`, l. 17 — bypasses RLS): `submitApproval` ll. 151–194, `decideApproval` ll. 205–251 | `scripts/mcp-server.ts` |
| UI renders `watchdog_decision` as a badge only | `src/app/(dashboard)/approvals/approval-queue.tsx` ll. 42–51, 283–289 |

**There is no execution path anywhere in the repo.** Nothing consumes
`status = "approved"` — no worker, route, or cron acts on a decided item. The
approval boundary is documentary; the kernel states it as evidence-packet
prose: "Action must stay in the approval queue until an authorized human
decision is recorded." (`governance.rs` l. 503). Accordingly the model defines
`Executable s qid` := the item *stands approved* — the strongest boundary the
code actually creates.

## Modeling choices

- Money is abstracted to the one boolean the kernel actually compares:
  `crossesLimit := observed > autonomous_limit` (`governance.rs` l. 417).
  `assess` is modeled on the four booleans that determine the verdict.
- `Item` deliberately has **no submitter field**, mirroring the schema; the
  REST submit model's submitter parameter is named `_submitter` and discarded,
  mirroring the route.
- `Step`/`Reachable` cover the REST and MCP operations (failed decides are
  no-op steps). The raw RLS table update (`rlsUpdate`) is modeled separately
  and deliberately **not** a `Step` — the trace invariants hold for the API
  paths and fail at the database layer; that contrast is finding F5.
- Out of scope (not the queue): `src/lib/stigmergy/*`; kernel
  `escalation.rs`/`velocity.rs` (pure, unwired — `velocity.rs` even has a
  `should_auto_execute`, but nothing consumes it).

## Theorem → source mapping (headline results)

| Theorem | Property | Source |
|---|---|---|
| `assess_blocked_iff`, `assess_pass_iff`, `assess_approvalRequired_iff` | Exact verdict logic: blocked ⟺ irreversible ∨ flagged; pass ⟺ none of the four triggers; else approval-required | `governance.rs` ll. 413–448 (triggers ll. 417–420) |
| `submitREST_creates_pending`, `submitMCP_creates_pending` | Every successful submit creates a **pending** item for *every* watchdog verdict, incl. `blocked` | submit route ll. 45–62; MCP ll. 151–194 |
| `decideREST_ok_queue` | REST decide succeeds ⟹ caller role = item's queue (the one identity check that exists) | decide route ll. 35–42 |
| `decideMCP_any_caller` | MCP decide succeeds for **every** caller string on any pending item — no auth, no queue check | MCP ll. 205–251 |
| `decideREST_ok_effect`, `applyDecision_item_change` | A successful decide changes exactly status + `decidedBy`, only from `pending` (the CAS write) | decide route ll. 49–56; MCP ll. 220–226 |
| `reachable_decided_forever` | **Decided at most once**: once decided, the whole record (status + decider) is frozen under any interleaving of both paths | CAS `.eq("status","pending")`, both paths |
| `reachable_rejected_forever`, `rejected_not_executable` | A rejected item never becomes executable via the API/MCP paths | — |
| `pending_not_executable` | Nothing is executable before approval | — |
| `step_born_pending` | Items enter the queue undecided | both submit paths |
| `reachable_no_loss`, `reachable_nodup` | Queue operations never lose a row and never duplicate an id (fresh-id insert; decide rewrites in place) | insert guard (PK conflict → 500), `applyDecision_map_id` |
| `decideREST_result_watchdog_free`, `decideMCP_result_watchdog_free` | Decide results depend on the row only via queue + status — **the stored watchdog verdict is never an input** | decide paths never read `watchdog_decision` |
| `race_double_decision_log` | Counterexample: two racing REST decides → one status write, two `ok`s, **two contradictory decision-log effects** | decide route's non-atomic check-then-CAS (see F4) |
| `rlsUpdate_rejected_to_executable` | One raw table update flips rejected → approved with an arbitrary recorded decider | RLS policy ll. 189–192 (see F5) |
| Exhibits (§8, §9) | Watchdog-**blocked** item approved by its own submitter (REST); MCP self-approval recorded under `"Sniper Agent"` and equally under `"CFO"`; rejected+blocked item flipped via RLS update | — |

## Headline findings

**F1 — The watchdog verdict gates nothing.** It is computed at submit, stored
on the row, rendered as a UI badge — and read by no decide path.
Watchdog-`blocked` items sit `pending` and are fully approvable on both paths
(machine-checked exhibit: blocked item submitted and approved, §8).
`decide*_result_watchdog_free` proves this is structural, not incidental.

**F2 — Separation of duties is impossible by construction.** The schema
records no submitter (`approval_items` has `decided_by` but no submitted-by
column), so no path can exclude the proposer from deciding. The REST exhibit
has the same person submit and approve; nothing in the code could prevent it.

**F3 — The MCP decide path has no identity at all.** `decideApproval`
performs no authentication and no queue/role check, runs on the
service-role key (RLS-bypassing), and stores the caller-supplied
`decided_by` string verbatim (`scripts/mcp-server.ts` ll. 205–251; update
l. 222). `decideMCP_any_caller` + the §8 exhibit: the same item is decidable
as `"Sniper Agent"`, as `"CFO"`, as anyone. The audit field is free text
asserted by the caller. (REST is better: auth required, role must equal the
queue, `decided_by = profile.id` — `decideREST_ok_queue`.)

**F4 — The REST decide race corrupts the audit trail (not the status).**
The route SELECTs (ll. 35–39), checks `pending` in TypeScript (ll. 44–45),
then CAS-updates (ll. 49–56) — but never checks how many rows the update
touched, and proceeds to the history/log/Slack side effects (ll. 57–105)
regardless. `race_double_decision_log` (proved by `decide`): Alice approves;
Bob, whose SELECT raced hers, "rejects" — the CAS correctly blocks his write,
both handlers return ok, and Bob's handler still emits a *rejected* decision
record for an item that stands approved. The status stays consistent
(`reachable_decided_forever`); the "chronological audit trail of every …
human decision" (README l. 41) does not.

**F5 — RLS bypasses the entire decision protocol.** Policy
`approval_items_update_same_queue` (ll. 189–192) grants UPDATE to any
authenticated user on rows in their queue, with no WITH CHECK beyond the
implicit queue constraint and no restriction on columns or status. Via
direct PostgREST, a same-queue user can set any item to any status with any
`decided_by` — `rlsUpdate_rejected_to_executable`: rejected → approved in
one update, no decision operation, no pending check. Every invariant proved
for the API paths (`reachable_decided_forever`, `reachable_rejected_forever`)
is false at the database layer.

**F6 — DB thresholds are write-only.** `agents.autonomous_limit` /
`approval_required_above` are written by `src/app/api/agent-threshold/route.ts`
and the MCP `update_agent_threshold` tool, but the kernel never reads the DB
(profiles are hardcoded, `governance.rs` ll. 132–289), and
`approval_required_above` is never used in `assess_governance_action` at all
— only `autonomous_limit`, via `observed > limit` (l. 417). Threshold edits
in the UI change no assessment.

**Positive results (what does hold, API/MCP layer):** decided-at-most-once
under arbitrary interleavings; rejected items can never execute; nothing
executes before approval; no row loss; no id duplication; items born pending;
REST queue-role check is real.

## README vs code divergences

- README l. 147: watchdog provides "default approval gates for high-impact
  actions" — the verdict gates nothing (F1).
- README ll. 59, 99: sub-threshold items "auto-execute" — no execution path
  exists for any item, approved or not; `Executable` in the model is the
  documentary boundary only.
- README l. 146: Approval Queue has "RLS-enforced role scoping" — reads are
  scoped, but the RLS *update* policy enforces queue membership only, not
  the decision protocol (F5).
- README l. 5: decisions "route through role-scoped approval queues" — true
  of the REST path only; the MCP path has no role scoping (F3).
