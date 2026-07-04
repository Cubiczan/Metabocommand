/**
 * StigmergyBoard tests — deposit / decay / read / evaporate, the SQLite store,
 * and the zero-token conflict-detection coordination path.
 *
 * Runner: Node's built-in test runner with TypeScript type-stripping (no extra
 * deps). Run with:
 *
 *   node --test --experimental-strip-types tests/stigmergy.test.ts
 *
 * A controllable clock is injected so decay is deterministic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  StigmergyBoard,
  InMemorySignalStore,
  currentStrength,
  decayConstant,
  GC_THRESHOLD,
  URGENCY_CAP,
  SIGNAL_HALF_LIVES,
  type Signal,
} from "../src/lib/stigmergy/board.ts";
import { SqliteSignalStore } from "../src/lib/stigmergy/sqlite-store.ts";
import {
  detectConflicts,
  postIntents,
  stigmergyCoordinationEnabled,
  CONFLICT_THRESHOLD,
} from "../src/lib/stigmergy/coordination.ts";

/** Mutable clock helper for deterministic decay. */
function makeClock(startMs: number): { now: () => number; advance: (secs: number) => void } {
  let t = startMs;
  return {
    now: () => t,
    advance: (secs: number) => {
      t += secs * 1000;
    },
  };
}

const T0 = 1_700_000_000_000;

// --- decay math ---------------------------------------------------------------

test("decayConstant is ln(2)/half_life and 0 for non-positive", () => {
  assert.ok(Math.abs(decayConstant(100) - Math.log(2) / 100) < 1e-12);
  assert.equal(decayConstant(0), 0);
  assert.equal(decayConstant(-1), 0);
});

test("currentStrength halves after one half-life", () => {
  const halfLife = SIGNAL_HALF_LIVES.completion; // 300s
  const signal: Signal = {
    id: "s1",
    region: "r",
    agent: "A",
    kind: "completion",
    strength: 1,
    depositedAt: T0,
  };
  const after = currentStrength(signal, T0 + halfLife * 1000);
  assert.ok(Math.abs(after - 0.5) < 0.01, `expected ~0.5, got ${after}`);
});

test("currentStrength returns 0 once decayed below GC threshold", () => {
  const signal: Signal = {
    id: "s2",
    region: "r",
    agent: "A",
    kind: "progress", // 20s half-life
    strength: 0.5,
    depositedAt: T0,
  };
  assert.equal(currentStrength(signal, T0 + 100_000 * 1000), 0);
});

test("urgency grows with age and is capped", () => {
  const signal: Signal = {
    id: "s3",
    region: "r",
    agent: "A",
    kind: "urgency",
    strength: 1,
    depositedAt: T0,
  };
  // +300s -> 1 * (1 + 300/300) = 2
  assert.ok(Math.abs(currentStrength(signal, T0 + 300 * 1000) - 2) < 0.01);
  // far future -> capped
  assert.equal(currentStrength(signal, T0 + 10_000_000 * 1000), URGENCY_CAP);
});

// --- deposit / read -----------------------------------------------------------

test("deposit_signal then read_signals returns fresh strength", () => {
  const clock = makeClock(T0);
  const board = new StigmergyBoard(new InMemorySignalStore(), clock.now);
  board.deposit_signal({ region: "meta-ads", agent: "Acquisition Agent", kind: "claim", strength: 1 });

  const readings = board.read_signals("meta-ads");
  const claim = readings.find((r) => r.kind === "claim");
  assert.ok(claim);
  assert.ok(Math.abs(claim.strength - 1) < 0.001);
  assert.deepEqual(claim.agents, ["Acquisition Agent"]);
});

test("read_signals aggregates strength and distinct agents per kind", () => {
  const clock = makeClock(T0);
  const board = new StigmergyBoard(new InMemorySignalStore(), clock.now);
  board.deposit_signal({ region: "sku-0091", agent: "Sniper Agent", kind: "veto", strength: 0.4 });
  board.deposit_signal({ region: "sku-0091", agent: "Conductor Agent", kind: "veto", strength: 0.3 });

  const veto = board.read_signals("sku-0091").find((r) => r.kind === "veto");
  assert.ok(veto);
  assert.ok(Math.abs(veto.strength - 0.7) < 0.001);
  assert.equal(veto.agents.length, 2);
});

test("read_signals reflects decay as the clock advances", () => {
  const clock = makeClock(T0);
  const board = new StigmergyBoard(new InMemorySignalStore(), clock.now);
  board.deposit_signal({ region: "r", agent: "A", kind: "completion", strength: 1 });

  clock.advance(SIGNAL_HALF_LIVES.completion); // one half-life
  const strength = board.read_kind("r", "completion");
  assert.ok(Math.abs(strength - 0.5) < 0.01, `expected ~0.5, got ${strength}`);
});

test("deposit_signal rejects non-positive strength", () => {
  const board = new StigmergyBoard();
  assert.throws(() => board.deposit_signal({ region: "r", agent: "A", kind: "claim", strength: 0 }));
});

test("in-memory store stays immutable across deposits", () => {
  const store = new InMemorySignalStore();
  const board = new StigmergyBoard(store, () => T0);
  board.deposit_signal({ region: "r", agent: "A", kind: "claim", strength: 1 });
  // Original store snapshot was never mutated.
  assert.equal(store.list().length, 0);
  assert.equal(board.size(), 1);
});

// --- evaporate ----------------------------------------------------------------

test("evaporate purges only spent signals", () => {
  const clock = makeClock(T0);
  const board = new StigmergyBoard(new InMemorySignalStore(), clock.now);
  board.deposit_signal({ region: "r", agent: "A", kind: "progress", strength: 1 }); // 20s half-life
  board.deposit_signal({ region: "r", agent: "B", kind: "failure", strength: 1 }); // 360s half-life

  clock.advance(600); // progress is long gone, failure still alive
  const purged = board.evaporate();
  assert.equal(purged, 1);
  assert.equal(board.size(), 1);
  assert.ok(board.read_kind("r", "failure") > GC_THRESHOLD);
});

test("evaporate is a no-op when nothing is spent", () => {
  const clock = makeClock(T0);
  const board = new StigmergyBoard(new InMemorySignalStore(), clock.now);
  board.deposit_signal({ region: "r", agent: "A", kind: "veto", strength: 1 });
  assert.equal(board.evaporate(), 0);
  assert.equal(board.size(), 1);
});

test("active_regions omits regions whose signals have all evaporated", () => {
  const clock = makeClock(T0);
  const board = new StigmergyBoard(new InMemorySignalStore(), clock.now);
  board.deposit_signal({ region: "gone", agent: "A", kind: "progress", strength: 1 });
  board.deposit_signal({ region: "kept", agent: "B", kind: "failure", strength: 1 });
  clock.advance(600);
  assert.deepEqual([...board.active_regions()].sort(), ["kept"]);
});

// --- SQLite store -------------------------------------------------------------

test("SQLite-backed board supports deposit/read/evaporate", () => {
  const clock = makeClock(T0);
  const store = new SqliteSignalStore(":memory:");
  const board = new StigmergyBoard(store, clock.now);

  board.deposit_signal({ region: "r", agent: "A", kind: "claim", strength: 1, note: "buy" });
  board.deposit_signal({ region: "r", agent: "B", kind: "progress", strength: 1 });

  assert.ok(Math.abs(board.read_kind("r", "claim") - 1) < 0.001);

  clock.advance(600);
  assert.equal(board.evaporate(), 1); // progress evaporated, claim survives
  assert.ok(board.read_kind("r", "claim") > 0);

  store.close();
});

test("SQLite store persists the note field", () => {
  const store = new SqliteSignalStore(":memory:");
  const board = new StigmergyBoard(store, () => T0);
  board.deposit_signal({ region: "r", agent: "A", kind: "claim", strength: 1, note: "context" });
  const rows = store.list("r");
  assert.equal(rows[0].note, "context");
  store.close();
});

// --- coordination path (conflict detection) -----------------------------------

test("stigmergyCoordinationEnabled reads the feature flag", () => {
  assert.equal(stigmergyCoordinationEnabled({}), false);
  assert.equal(stigmergyCoordinationEnabled({ STIGMERGY_COORDINATION: "1" }), true);
  assert.equal(stigmergyCoordinationEnabled({ STIGMERGY_COORDINATION: "true" }), true);
  assert.equal(stigmergyCoordinationEnabled({ STIGMERGY_COORDINATION: "0" }), false);
});

test("detectConflicts finds claim vs veto from different agents", () => {
  const clock = makeClock(T0);
  const board = new StigmergyBoard(new InMemorySignalStore(), clock.now);
  // Reproduces the Acquisition-vs-Sniper conflict without any LLM messages.
  postIntents(board, [
    { agent: "Acquisition Agent", region: "meta-ads", kind: "claim", strength: 1, note: "+$4,200/mo" },
    { agent: "Sniper Agent", region: "meta-ads", kind: "veto", strength: 1, note: "low-velocity waste" },
  ]);

  const conflicts = detectConflicts(board, T0);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].agents.sort(), ["Acquisition Agent", "Sniper Agent"]);
  assert.match(conflicts[0].conflictingActions, /meta-ads/);
});

test("detectConflicts ignores a claim opposed only by the same agent", () => {
  const clock = makeClock(T0);
  const board = new StigmergyBoard(new InMemorySignalStore(), clock.now);
  postIntents(board, [
    { agent: "Acquisition Agent", region: "meta-ads", kind: "claim", strength: 1 },
    { agent: "Acquisition Agent", region: "meta-ads", kind: "difficulty", strength: 1 },
  ]);
  assert.equal(detectConflicts(board, T0).length, 0);
});

test("detectConflicts ignores conflicts once opposing scent evaporates", () => {
  const clock = makeClock(T0);
  const board = new StigmergyBoard(new InMemorySignalStore(), clock.now);
  postIntents(board, [
    { agent: "Acquisition Agent", region: "meta-ads", kind: "claim", strength: 1 },
    { agent: "Sniper Agent", region: "meta-ads", kind: "difficulty", strength: 1 }, // 120s half-life
  ]);
  assert.equal(detectConflicts(board, clock.now()).length, 1);

  clock.advance(1200); // difficulty decays well below CONFLICT_THRESHOLD
  assert.ok(board.read_kind("meta-ads", "difficulty") < CONFLICT_THRESHOLD);
  assert.equal(detectConflicts(board, clock.now()).length, 0);
});
