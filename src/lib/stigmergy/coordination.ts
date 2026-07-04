/**
 * Stigmergic coordination path — the zero-token replacement for the Harmony
 * Agent's LLM-chat conflict resolution.
 *
 * Previously, cross-agent conflicts (e.g. Acquisition wanting to raise Meta Ads
 * spend on the same channel Sniper flags as waste) were surfaced by agents
 * conversing through the LLM. That is the coordination path this module
 * replaces: agents instead {@link StigmergyBoard.deposit_signal deposit} their
 * intent as scent onto a shared *region* (a channel, SKU, or capital pool), and
 * conflicts are *detected* by reading overlapping signals on that region. No
 * agent messages another agent through the model.
 *
 * A conflict exists on a region when a "claim" (an agent intending to act) and
 * an opposing signal ("veto", "failure", or "difficulty") from a *different*
 * agent are both currently present above threshold. That read is pure
 * arithmetic over the board — zero LLM calls.
 *
 * The path is additive and feature-flagged: {@link stigmergyCoordinationEnabled}
 * gates whether callers should use it in place of the existing chat/dummy path.
 */

import { harmonyConflicts, type AgentConflict } from "@/lib/dummy-data-lifetime";
import {
  StigmergyBoard,
  InMemorySignalStore,
  type SignalKind,
  type SignalReading,
} from "./board";

/**
 * Whether stigmergic coordination should be used instead of the LLM-chat path.
 * Off by default so existing behaviour is unchanged; opt in with
 * `STIGMERGY_COORDINATION=1` (or `true`).
 */
export function stigmergyCoordinationEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const flag = env.STIGMERGY_COORDINATION;
  return flag === "1" || flag === "true";
}

/** Signal kinds that oppose a "claim" on a region and thus imply a conflict. */
const OPPOSING_KINDS: readonly SignalKind[] = ["veto", "failure", "difficulty"];

/** Minimum aggregated strength for a signal to count toward a conflict. */
export const CONFLICT_THRESHOLD = 0.25;

function readingFor(
  readings: readonly SignalReading[],
  kind: SignalKind
): SignalReading | undefined {
  return readings.find((r) => r.kind === kind);
}

function isoFromMillis(millis: number): string {
  return new Date(millis).toISOString().replace("T", " ").slice(0, 16);
}

/**
 * Detect cross-agent conflicts by reading the board — the drop-in for the
 * Harmony Agent's LLM conflict-resolution loop.
 *
 * For every active region, a conflict is emitted when a "claim" and an opposing
 * signal from a *different* agent are both present above {@link CONFLICT_THRESHOLD}.
 * The returned shape matches the existing {@link AgentConflict} the Harmony view
 * already renders, so it slots straight into the UI.
 */
export function detectConflicts(board: StigmergyBoard, now = Date.now()): AgentConflict[] {
  const conflicts: AgentConflict[] = [];

  for (const region of board.active_regions()) {
    const readings = board.read_signals(region);
    const claim = readingFor(readings, "claim");
    if (!claim || claim.strength < CONFLICT_THRESHOLD) continue;

    for (const kind of OPPOSING_KINDS) {
      const opposing = readingFor(readings, kind);
      if (!opposing || opposing.strength < CONFLICT_THRESHOLD) continue;

      const opposingAgents = opposing.agents.filter((a) => !claim.agents.includes(a));
      if (opposingAgents.length === 0) continue;

      const agents = [...new Set([...claim.agents, ...opposingAgents])];
      conflicts.push({
        id: `cf-${region}-${kind}`,
        agents,
        conflictingActions:
          `${claim.agents.join(", ")} claim region "${region}" (claim ${claim.strength.toFixed(2)}) ` +
          `while ${opposingAgents.join(", ")} raise ${kind} (${opposing.strength.toFixed(2)})`,
        resolution:
          `Hold ${claim.agents.join(", ")} action on "${region}" until ${kind} scent evaporates ` +
          `or an owner overrides; re-read board before executing.`,
        detectedAt: isoFromMillis(now),
      });
      break; // one conflict summary per region is enough for the queue
    }
  }

  return conflicts;
}

/**
 * A small, illustrative shape for how agents post their intent to the board
 * rather than describing it in chat. Each agent's "turn" becomes one deposit.
 */
export interface AgentIntent {
  readonly agent: string;
  readonly region: string;
  readonly kind: SignalKind;
  readonly strength: number;
  readonly note?: string;
}

/**
 * Post a batch of agent intents onto the board. This is what the coordination
 * loop calls instead of exchanging LLM messages: every agent writes its scent,
 * then any agent (or the Harmony view) reads the board to coordinate.
 */
export function postIntents(board: StigmergyBoard, intents: readonly AgentIntent[]): void {
  for (const intent of intents) {
    board.deposit_signal({
      region: intent.region,
      agent: intent.agent,
      kind: intent.kind,
      strength: intent.strength,
      note: intent.note,
    });
  }
}

/**
 * The live coordination scenario, expressed as board deposits rather than LLM
 * conversations. Mirrors the two conflicts the Harmony Agent has always shown
 * (Acquisition vs Sniper on Meta Ads; Demand Prophet vs Conductor on SKU-0091),
 * so enabling the flag reproduces the same conflicts with zero LLM calls.
 */
const HARMONY_INTENTS: readonly AgentIntent[] = [
  { agent: "Acquisition Agent", region: "meta-ads", kind: "claim", strength: 1, note: "+$4,200/mo spend" },
  { agent: "Sniper Agent", region: "meta-ads", kind: "veto", strength: 1, note: "low-velocity waste" },
  { agent: "Demand Prophet Agent", region: "sku-0091", kind: "claim", strength: 1, note: "$58,800 PO" },
  { agent: "Conductor Agent", region: "sku-0091", kind: "veto", strength: 1, note: "insufficient liquidity buffer" },
];

/**
 * Build a fresh in-memory board seeded with the current agent intents. Pure and
 * isomorphic — no `node:sqlite`, safe to call from client or server. Pass a
 * fixed `now` for deterministic output.
 */
export function buildHarmonyBoard(
  now = Date.now(),
  intents: readonly AgentIntent[] = HARMONY_INTENTS
): StigmergyBoard {
  const board = new StigmergyBoard(new InMemorySignalStore(), () => now);
  postIntents(board, intents);
  return board;
}

/**
 * Resolve the conflicts the Harmony view should render.
 *
 * When `STIGMERGY_COORDINATION` is enabled, conflicts are DERIVED from the
 * stigmergy board (zero LLM calls). Otherwise the existing static
 * {@link harmonyConflicts} list is returned unchanged, so default behaviour is
 * byte-for-byte the same. This is the single wiring point that swaps the
 * LLM-chat coordination path for the stigmergic one.
 */
export function resolveHarmonyConflicts(
  enabled = stigmergyCoordinationEnabled(),
  now = Date.now()
): AgentConflict[] {
  if (!enabled) return harmonyConflicts;
  return detectConflicts(buildHarmonyBoard(now), now);
}
