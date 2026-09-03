# Design: Metabocommand HITL MCP

## Context

The product already has:

- `POST /api/approvals/submit` — create pending item + evidence packet + action log
- `POST /api/approvals/decide` — pending → approved/rejected + activity + action log
- `GET /api/approvals/evidence` — role-scoped evidence packet
- RSC pages that list `approval_items` and `agent_action_log` via Supabase + RLS
- `src/lib/governance-watchdog.ts` — seniority, policy flags, evidence packets

There is no CLI and no list HTTP API. Live MCP therefore needs either new thin
list routes or a running dashboard session talking to Supabase. Demo mode must
work with no server.

## Goals

- Agent-callable tools against **real product code**, not a second engine
- Safe local/demo path (seed fixtures, in-process)
- Cursor + Claude Code install matching `@cubiczan/chp-mcp`
- Brand: Cubiczan

## Non-goals

- Rebuild the dashboard or Realtime/Presence UI
- New workflow states or a workflow engine
- Duplicate `evaluate_spend_gate` / numeric capital gates
- Publish npm or PyPI from this change

## Architecture

```text
MCP client (Cursor / Claude Code)
        │  tools/call
        ▼
┌────────────────────────────────────┐
│  @cubiczan/metabocommand-mcp       │  stdio transport
│  list_pending_approvals            │
│  request_approval                  │
│  decide_approval                   │
│  list_agent_action_log             │
│  list_capital_reflex               │
└──────────────┬─────────────────────┘
               │ wraps
               ▼
┌────────────────────────────────────┐
│  src/lib/hitl (product service)    │
│  MemoryStore (demo fixtures)       │
│  or HTTP → Next.js API (live)      │
│  uses buildEvidencePacket          │
└────────────────────────────────────┘
```

Demo is the default (`METABOCOMMAND_MODE=demo`). Live mode requires
`METABOCOMMAND_API_URL` and a Supabase user JWT (`METABOCOMMAND_ACCESS_TOKEN`)
against a running Next.js app. Numeric spend gates remain
`npx -y @cubiczan/chp-mcp`.

## Decision note

`decide` currently has no note field. The MCP tool accepts `note` and the API
persists it in the existing `agent_action_log.reasoning_summary` (and activity
description). No schema migration.
