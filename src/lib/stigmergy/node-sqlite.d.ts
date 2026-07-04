/**
 * Minimal ambient types for Node's built-in `node:sqlite` module.
 *
 * The repo pins `@types/node@20`, which predates the `node:sqlite` API (stable
 * in Node 22+, which CI uses). This declares only the small surface the
 * StigmergyBoard's SQLite store depends on, so `tsc --noEmit` resolves the
 * import without bumping the global `@types/node` dependency. Remove this file
 * once `@types/node` is upgraded to a version that ships `sqlite` types.
 */
declare module "node:sqlite" {
  interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  interface StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
  }

  class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
