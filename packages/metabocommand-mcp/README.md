# `@cubiczan/metabocommand-mcp`

Stdio MCP server so Cursor and Claude Code can use **Cubiczan Metabocommand**
as HITL tools: Capital Reflex, approval queues, and the agent action log.

CHP is the lock; MCP is the pipe. This package is the **approval-queue
surface**. Numeric spend/capital gates stay on
[`@cubiczan/chp-mcp`](https://www.npmjs.com/package/@cubiczan/chp-mcp) —
this server does **not** implement `evaluate_spend_gate`.

```text
MCP client (Cursor / Claude Code)
        │  tools/call
        ▼
┌────────────────────────────────────┐
│  @cubiczan/metabocommand-mcp       │  ← you are here
│  list_pending_approvals            │
│  request_approval                  │
│  decide_approval                   │
│  list_agent_action_log             │
│  list_capital_reflex               │
└──────────────┬─────────────────────┘
               │ wraps product HITL
               ▼
┌────────────────────────────────────┐
│  Metabocommand approval_items +    │
│  agent_action_log + watchdog       │
│  demo fixtures  or  live Next.js   │
└────────────────────────────────────┘
```

## Install

The intended published name is `@cubiczan/metabocommand-mcp`. Until npm
publish, run the package from this repo:

```bash
cd packages/metabocommand-mcp
npm install
npm run build
```

### Cursor / Claude Desktop

Project or user `mcp.json`:

```json
{
  "mcpServers": {
    "metabocommand": {
      "command": "npx",
      "args": ["-y", "@cubiczan/metabocommand-mcp"]
    },
    "chp": {
      "command": "npx",
      "args": ["-y", "@cubiczan/chp-mcp"]
    }
  }
}
```

From a clone (before publish):

```json
{
  "mcpServers": {
    "metabocommand": {
      "command": "node",
      "args": ["packages/metabocommand-mcp/dist/index.js"],
      "env": {
        "METABOCOMMAND_MODE": "demo"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add metabocommand -- npx -y @cubiczan/metabocommand-mcp
```

From a clone:

```bash
claude mcp add metabocommand -- node ./packages/metabocommand-mcp/dist/index.js
```

## Modes

| Mode | Env | Needs a running app? |
|------|-----|----------------------|
| **demo** (default) | `METABOCOMMAND_MODE=demo` | No. In-process seed fixtures from `supabase/migrations/0002_seed.sql`. Safe local path. |
| **live** | `METABOCOMMAND_MODE=live` plus API URL + user JWT | Yes. Wraps `POST /api/approvals/submit`, `POST /api/approvals/decide`, `GET /api/approvals`, `GET /api/agent-log`. |

Live example:

```bash
npm run dev   # from the Metabocommand repo root
```

```json
{
  "mcpServers": {
    "metabocommand": {
      "command": "npx",
      "args": ["-y", "@cubiczan/metabocommand-mcp"],
      "env": {
        "METABOCOMMAND_MODE": "live",
        "METABOCOMMAND_API_URL": "http://localhost:3000",
        "METABOCOMMAND_ACCESS_TOKEN": "<supabase user jwt>"
      }
    }
  }
}
```

The JWT is a normal Supabase user session (Sarah / James in the README seed).
RLS still scopes finance vs operations. This MCP does not use the service role.

## Tools

| Tool | Maps to | Purpose |
|------|---------|---------|
| `list_pending_approvals` | Approval queue query | Pending `approval_items` |
| `request_approval` | `POST /api/approvals/submit` + `buildEvidencePacket` | Queue a proposal |
| `decide_approval` | `POST /api/approvals/decide` | Approve/reject with a note |
| `list_agent_action_log` | Agent action log query | Chronological audit trail |
| `list_capital_reflex` | Finance queue + Capital Reflex agents | HITL snapshot; points spend gates at chp-mcp |
| `metabocommand_version` | — | Package / brand / CHP pointer |

## Related

| Package / repo | Role |
|----------------|------|
| [`@cubiczan/chp-mcp`](https://www.npmjs.com/package/@cubiczan/chp-mcp) | Profile B spend/capital gates (`evaluate_spend_gate`) |
| [Metabocommand](https://github.com/Cubiczan/Metabocommand) | Dashboard this server wraps |
| [`@cubiczan/chp`](https://www.npmjs.com/package/@cubiczan/chp) | CHP Profile B library |

## Licence

MIT.
