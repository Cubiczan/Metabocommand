/**
 * StigmergyBoard — zero-token inter-agent coordination via decaying signals.
 *
 * MetaboCommand coordinates ~12 agents (Pulse, Oracle, Sniper, Conductor,
 * Acquisition, Conversion, Retention, Demand Prophet, Logistics Conductor,
 * Support Reflex, Advocacy, Harmony). Historically these agents coordinated by
 * talking to each other through the LLM chat loop — every conflict check and
 * hand-off was an inter-agent conversation, and that cost grows quadratically
 * with the number of agents (h̄·m(m+1)/2 messages).
 *
 * Stigmergy removes those conversations. Instead of messaging each other,
 * agents write short-lived "scent" signals onto a shared board and read the
 * aggregated signal for a region. Coordination becomes pure arithmetic over the
 * board — zero LLM calls. The concept is ported from the Cubiczan swarm pack
 * (TEMM1E-derived scent field): exponential decay for most signal kinds, a
 * growing "urgency" kind, and periodic evaporation of spent signals.
 *
 * This module is pure and deterministic: all time comes from an injectable
 * clock, and the default store is immutable (every deposit returns a new store
 * snapshot). A SQLite-backed store is available for durable server-side use —
 * see `./sqlite-store`.
 */

/** Kinds of scent an agent can deposit, each with its own decay behaviour. */
export type SignalKind =
  | "completion" // task finished — moderate decay (5 min half-life)
  | "failure" // attempt failed — slow decay (6 min half-life)
  | "difficulty" // agent struggling — fast decay (2 min half-life)
  | "urgency" // grows over time instead of decaying, capped
  | "progress" // heartbeat — very fast decay (20 sec half-life)
  | "help_wanted" // specialist requested — fast decay (2 min half-life)
  | "claim" // agent intends to act on this region — moderate decay
  | "veto"; // agent objects to action on this region — slow decay

/** All signal kinds, in a stable order. */
export const SIGNAL_KINDS: readonly SignalKind[] = [
  "completion",
  "failure",
  "difficulty",
  "urgency",
  "progress",
  "help_wanted",
  "claim",
  "veto",
] as const;

/**
 * Half-life in seconds for each signal kind.
 * A non-positive value marks a growing signal (urgency), which increases with
 * age instead of decaying.
 */
export const SIGNAL_HALF_LIVES: Readonly<Record<SignalKind, number>> = {
  completion: 300,
  failure: 360,
  difficulty: 120,
  urgency: -1,
  progress: 20,
  help_wanted: 120,
  claim: 240,
  veto: 480,
};

/**
 * Signals whose decayed strength falls below this threshold are considered
 * spent and are removed by {@link evaporate}. Reads also ignore them.
 */
export const GC_THRESHOLD = 0.01;

/** Growing signals are capped at this multiple of their deposited strength. */
export const URGENCY_CAP = 5;

/** A single scent deposit made by one agent onto one region of the board. */
export interface Signal {
  readonly id: string;
  /** Region the signal applies to (e.g. a channel, SKU, or capital pool). */
  readonly region: string;
  /** Agent that deposited the signal (e.g. "Sniper Agent"). */
  readonly agent: string;
  readonly kind: SignalKind;
  /** Strength at deposit time (before decay). */
  readonly strength: number;
  /** Epoch milliseconds the signal was deposited. */
  readonly depositedAt: number;
  /** Optional free-form context carried alongside the signal. */
  readonly note?: string;
}

/** Aggregated, decayed reading for one signal kind within a region. */
export interface SignalReading {
  readonly kind: SignalKind;
  /** Sum of the current (decayed) strengths of all matching signals. */
  readonly strength: number;
  /** Distinct agents that contributed to this reading. */
  readonly agents: readonly string[];
}

/** A monotonic-enough source of the current epoch time in milliseconds. */
export type Clock = () => number;

/** Fields required to deposit a signal; ids and timestamps are filled in. */
export interface SignalDeposit {
  readonly region: string;
  readonly agent: string;
  readonly kind: SignalKind;
  readonly strength: number;
  readonly note?: string;
}

/**
 * Storage backend for signals. The board is store-agnostic; the default
 * {@link InMemorySignalStore} is pure and immutable, while `SqliteSignalStore`
 * (in `./sqlite-store`) persists to disk. All strengths returned are raw
 * deposit strengths — decay is applied by the board, not the store.
 */
export interface SignalStore {
  insert(signal: Signal): void;
  /** All signals, optionally filtered to a single region. */
  list(region?: string): readonly Signal[];
  /** Remove signals by id. Returns the count removed. */
  remove(ids: readonly string[]): number;
  clear(): void;
}

const LN_2 = Math.log(2);

/** Decay constant λ = ln(2) / half_life. Non-positive half-life → 0. */
export function decayConstant(halfLifeSeconds: number): number {
  return halfLifeSeconds > 0 ? LN_2 / halfLifeSeconds : 0;
}

/**
 * Current strength of a signal at `now`, applying decay (or growth for
 * urgency). Returns 0 when the signal is spent, in the future, or non-positive.
 */
export function currentStrength(signal: Signal, now: number): number {
  if (signal.strength <= 0) return 0;
  const elapsedSeconds = (now - signal.depositedAt) / 1000;
  if (elapsedSeconds <= 0) return signal.strength;

  const halfLife = SIGNAL_HALF_LIVES[signal.kind];
  if (halfLife <= 0) {
    // Growing signal (urgency): strength climbs with age, capped.
    const grown = signal.strength * (1 + elapsedSeconds / 300);
    return Math.min(grown, signal.strength * URGENCY_CAP);
  }

  const decayed = signal.strength * Math.exp(-decayConstant(halfLife) * elapsedSeconds);
  return decayed < GC_THRESHOLD ? 0 : decayed;
}

/**
 * Pure, immutable, in-process store — the board's default backend.
 *
 * It deliberately does NOT implement the mutable {@link SignalStore} interface:
 * every write returns a fresh instance and the internal array is never mutated
 * in place, matching the repo's immutability convention. {@link StigmergyBoard}
 * swaps its reference to a new snapshot on each deposit/evaporate.
 */
export class InMemorySignalStore {
  private readonly signals: readonly Signal[];

  constructor(signals: readonly Signal[] = []) {
    this.signals = signals;
  }

  /** Return a new store with `signal` appended. */
  withSignal(signal: Signal): InMemorySignalStore {
    return new InMemorySignalStore([...this.signals, signal]);
  }

  /** Return a new store with the given ids removed. */
  without(ids: readonly string[]): InMemorySignalStore {
    if (ids.length === 0) return this;
    const drop = new Set(ids);
    return new InMemorySignalStore(this.signals.filter((s) => !drop.has(s.id)));
  }

  list(region?: string): readonly Signal[] {
    return region === undefined ? this.signals : this.signals.filter((s) => s.region === region);
  }
}

let signalCounter = 0;

function nextSignalId(now: number): string {
  signalCounter += 1;
  return `sig_${now.toString(36)}_${signalCounter.toString(36)}`;
}

/**
 * The shared coordination surface. Agents {@link deposit_signal} scent onto
 * regions and {@link read_signals} the aggregated, decayed state of a region.
 * {@link evaporate} purges spent signals.
 *
 * The board is generic over its {@link SignalStore}. With the default
 * immutable in-memory store, deposit/evaporate swap the internal store
 * reference for a new snapshot, so the board itself stays a stable handle while
 * the underlying data is never mutated in place. Durable stores
 * (`SqliteSignalStore`) mutate their own backing table directly.
 */
export class StigmergyBoard {
  private store: SignalStore | InMemorySignalStore;
  private readonly clock: Clock;

  constructor(store?: SignalStore | InMemorySignalStore, clock: Clock = () => Date.now()) {
    this.store = store ?? new InMemorySignalStore();
    this.clock = clock;
  }

  /** Deposit a scent signal onto a region. Returns the created signal. */
  deposit_signal(deposit: SignalDeposit): Signal {
    if (deposit.strength <= 0) {
      throw new Error(`signal strength must be positive, got ${deposit.strength}`);
    }
    const now = this.clock();
    const signal: Signal = {
      id: nextSignalId(now),
      region: deposit.region,
      agent: deposit.agent,
      kind: deposit.kind,
      strength: deposit.strength,
      depositedAt: now,
      note: deposit.note,
    };

    if (this.store instanceof InMemorySignalStore) {
      this.store = this.store.withSignal(signal);
    } else {
      this.store.insert(signal);
    }
    return signal;
  }

  /**
   * Read the aggregated, decayed signal state of a region: one
   * {@link SignalReading} per kind that still has non-spent strength. Pure
   * arithmetic — no LLM calls.
   */
  read_signals(region: string): readonly SignalReading[] {
    const now = this.clock();
    const byKind = new Map<SignalKind, { strength: number; agents: Set<string> }>();

    for (const signal of this.store.list(region)) {
      const strength = currentStrength(signal, now);
      if (strength <= 0) continue;
      const entry = byKind.get(signal.kind) ?? { strength: 0, agents: new Set<string>() };
      entry.strength += strength;
      entry.agents.add(signal.agent);
      byKind.set(signal.kind, entry);
    }

    return SIGNAL_KINDS.filter((kind) => byKind.has(kind)).map((kind) => {
      const entry = byKind.get(kind)!;
      return { kind, strength: entry.strength, agents: [...entry.agents] };
    });
  }

  /** Convenience: aggregated decayed strength for one kind in a region. */
  read_kind(region: string, kind: SignalKind): number {
    return this.read_signals(region).find((r) => r.kind === kind)?.strength ?? 0;
  }

  /** Distinct regions that currently carry any non-spent signal. */
  active_regions(): readonly string[] {
    const now = this.clock();
    const regions = new Set<string>();
    for (const signal of this.store.list()) {
      if (currentStrength(signal, now) > 0) regions.add(signal.region);
    }
    return [...regions];
  }

  /** Remove all spent signals (decayed below {@link GC_THRESHOLD}). Returns count purged. */
  evaporate(): number {
    const now = this.clock();
    const expired = this.store.list().filter((s) => currentStrength(s, now) <= 0);
    const ids = expired.map((s) => s.id);
    if (ids.length === 0) return 0;

    if (this.store instanceof InMemorySignalStore) {
      this.store = this.store.without(ids);
      return ids.length;
    }
    return this.store.remove(ids);
  }

  /** Number of signals currently held (including not-yet-evaporated spent ones). */
  size(): number {
    return this.store.list().length;
  }
}
