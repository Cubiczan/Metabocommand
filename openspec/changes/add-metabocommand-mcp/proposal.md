# Change: Add Metabocommand HITL MCP server

## Why

Cursor and Claude Code cannot call Metabocommand's human-in-the-loop surface
today. Agents need to list pending approvals, request approval for a proposed
action, approve or reject with a note, and read the agent action log — without
rebuilding the dashboard or inventing a new workflow engine.

CHP remains the lock. This MCP is the pipe: the approval-queue surface only.
Spend/capital numeric gates stay on `@cubiczan/chp-mcp`.

## What Changes

- Extract the existing approval submit/decide/list and action-log reads into a
  store-backed HITL service that wraps current product behavior
  (`buildEvidencePacket`, pending → approved/rejected, role-scoped queues).
- Add thin authenticated list routes so a live MCP client can wrap the same
  HTTP surface the dashboard already uses.
- Accept an optional decision note on approve/reject (stored in the existing
  action-log reasoning field — no new workflow states).
- Ship a stdio MCP package `@cubiczan/metabocommand-mcp` following
  `@cubiczan/chp-mcp` (Cursor `mcp.json`, `claude mcp add`).
- Default to an in-process demo/fixture store (seed-derived). Document the
  live path that needs the Next.js app + Supabase session.
- Prepare npm packaging. Do not publish from this change.

## Capabilities

- `hitl-mcp`: stdio MCP tools for Capital Reflex / approval queues / agent action log
- `approval-queue-api`: list + optional note wrap of existing submit/decide

## Impact

- Dashboard UI is unchanged.
- Existing submit/decide JSON remains valid; new `note` is optional.
- Root TypeScript config excludes the MCP package so Next.js `tsc` stays isolated.
- CI runs HITL unit tests and the MCP package `tools/list` + queue happy path.
