/**
 * Human-in-the-loop surface used by the dashboard APIs and
 * `@cubiczan/metabocommand-mcp`. This is not a new workflow engine —
 * it wraps submit / decide / list / action-log behavior that already exists.
 */
export { HitlError, hitlStatus } from "./errors";
export { DEMO_ACTORS, DEMO_AGENTS, DEMO_APPROVAL_IDS, DEMO_APPROVALS, DEMO_ACTION_LOG } from "./fixtures";
export { MemoryHitlStore } from "./memory-store";
export { HitlService, createDemoHitlService } from "./service";
export type {
  CapitalReflexSnapshot,
  DecideApprovalInput,
  HitlHooks,
  RequestApprovalInput,
} from "./service";
export { SupabaseHitlStore } from "./supabase-store";
export type {
  ActionLogListFilter,
  ApprovalListFilter,
  HitlActor,
  HitlStore,
  NewActionLogEntry,
  NewActivityEntry,
  NewApprovalItem,
} from "./store";
