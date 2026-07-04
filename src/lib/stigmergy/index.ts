/**
 * Stigmergic coordination for MetaboCommand's agent swarm.
 *
 * See `./board` for the {@link StigmergyBoard} primitive and `./coordination`
 * for the zero-token replacement of the LLM-chat conflict path. The SQLite
 * store lives in `./sqlite-store` and is intentionally NOT re-exported here so
 * the client bundle never pulls in `node:sqlite`; import it directly from
 * server code.
 */
export * from "./board";
export * from "./coordination";
