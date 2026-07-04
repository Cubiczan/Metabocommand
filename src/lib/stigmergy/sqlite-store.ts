/**
 * Durable, SQLite-backed {@link SignalStore} for the {@link StigmergyBoard}.
 *
 * Uses Node's built-in `node:sqlite` module (stable in Node 22+, which is what
 * CI runs) so it adds ZERO new npm dependencies and never enters the browser
 * bundle. Decay is still computed by the board in `board.ts`; this store only
 * persists raw deposits and hands them back.
 *
 * This mirrors the SQLite scent-field variant proven out in the swarm packs —
 * it shows the coordination board needs nothing heavier than a single table and
 * two indexes, no external coordination service.
 *
 * Server-only: import this from route handlers / server code, never from a
 * "use client" component.
 */

import { DatabaseSync } from "node:sqlite";
import type { Signal, SignalKind, SignalStore } from "./board";

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS stigmergy_signals (
    id           TEXT PRIMARY KEY,
    region       TEXT NOT NULL,
    agent        TEXT NOT NULL,
    kind         TEXT NOT NULL,
    strength     REAL NOT NULL,
    deposited_at INTEGER NOT NULL,
    note         TEXT
  )
`;

const CREATE_REGION_INDEX = `CREATE INDEX IF NOT EXISTS idx_stigmergy_region ON stigmergy_signals(region)`;
const CREATE_KIND_INDEX = `CREATE INDEX IF NOT EXISTS idx_stigmergy_kind ON stigmergy_signals(kind)`;

interface Row {
  id: string;
  region: string;
  agent: string;
  kind: string;
  strength: number;
  deposited_at: number;
  note: string | null;
}

function rowToSignal(row: Row): Signal {
  const signal: Signal = {
    id: row.id,
    region: row.region,
    agent: row.agent,
    kind: row.kind as SignalKind,
    strength: row.strength,
    depositedAt: row.deposited_at,
  };
  return row.note === null ? signal : { ...signal, note: row.note };
}

/**
 * SQLite-backed signal store. Pass `":memory:"` (the default) for an ephemeral
 * database or a file path for a durable board shared across processes.
 */
export class SqliteSignalStore implements SignalStore {
  private readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(CREATE_TABLE);
    this.db.exec(CREATE_REGION_INDEX);
    this.db.exec(CREATE_KIND_INDEX);
  }

  insert(signal: Signal): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO stigmergy_signals
           (id, region, agent, kind, strength, deposited_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        signal.id,
        signal.region,
        signal.agent,
        signal.kind,
        signal.strength,
        signal.depositedAt,
        signal.note ?? null
      );
  }

  list(region?: string): readonly Signal[] {
    const rows =
      region === undefined
        ? (this.db.prepare(`SELECT * FROM stigmergy_signals`).all() as unknown as Row[])
        : (this.db
            .prepare(`SELECT * FROM stigmergy_signals WHERE region = ?`)
            .all(region) as unknown as Row[]);
    return rows.map(rowToSignal);
  }

  remove(ids: readonly string[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(",");
    const result = this.db
      .prepare(`DELETE FROM stigmergy_signals WHERE id IN (${placeholders})`)
      .run(...ids);
    return Number(result.changes);
  }

  clear(): void {
    this.db.exec(`DELETE FROM stigmergy_signals`);
  }

  /** Close the underlying database handle. */
  close(): void {
    this.db.close();
  }
}
