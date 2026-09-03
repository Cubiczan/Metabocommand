# hitl-mcp

HITL MCP surface for Cubiczan Metabocommand approval queues and the agent action log.

## ADDED Requirements

### Requirement: Stdio MCP server

The project SHALL provide a stdio MCP server packaged as
`@cubiczan/metabocommand-mcp` that starts without a running dashboard when
demo mode is selected.

#### Scenario: Server starts on stdio

- GIVEN the package is built
- WHEN a client connects over stdio
- THEN initialize succeeds and `tools/list` includes approval and action-log tools

### Requirement: List pending approvals

The server SHALL expose `list_pending_approvals` that returns pending items
from the product approval queue (finance and/or operations).

#### Scenario: Demo fixture queue

- GIVEN demo mode with seed-derived fixtures
- WHEN an agent calls `list_pending_approvals`
- THEN the result includes pending Capital Reflex and operations proposals
  from the product seed set

### Requirement: Request approval

The server SHALL expose `request_approval` that wraps the existing submit
behavior: evidence packet via `buildEvidencePacket`, status `pending`, and an
agent action log proposal row.

#### Scenario: Queue a proposal

- GIVEN a valid agent name, queue, action description, and financial impact
- WHEN `request_approval` is called
- THEN a pending approval id is returned and the item appears in a subsequent
  `list_pending_approvals` call

### Requirement: Approve or reject with a note

The server SHALL expose `decide_approval` that transitions a pending item to
`approved` or `rejected` and records the note on the existing action-log
reasoning field. Already-decided items SHALL be rejected (conflict), matching
the product API.

#### Scenario: Approve a fixture item

- GIVEN a pending demo item
- WHEN `decide_approval` is called with `decision=approved` and a note
- THEN the item is no longer pending and the action log contains a Decision
  row that includes the note

### Requirement: Read the agent action log

The server SHALL expose `list_agent_action_log` that returns chronological
action-log rows from the product log (proposals, decisions, auto-executes).

#### Scenario: Read demo log

- GIVEN demo fixtures
- WHEN `list_agent_action_log` is called
- THEN seed-derived log rows are returned

### Requirement: Capital Reflex surface without spend-gate duplication

The server SHALL expose a Capital Reflex read tool that lists finance-queue
HITL state. It SHALL NOT implement `evaluate_spend_gate` or other numeric
CHP Profile B gates.

#### Scenario: Point spend gates at chp-mcp

- GIVEN `list_capital_reflex` is called
- THEN the payload identifies `@cubiczan/chp-mcp` as the spend-gate surface
  and includes pending finance-queue items

### Requirement: Install docs

The package README SHALL document Cursor `mcp.json` and
`claude mcp add` install, plus the live-server requirement and demo fallback.

#### Scenario: Docs name Cubiczan

- GIVEN the MCP README
- WHEN a reader follows install
- THEN the brand is spelled Cubiczan and the intended package is
  `@cubiczan/metabocommand-mcp`
