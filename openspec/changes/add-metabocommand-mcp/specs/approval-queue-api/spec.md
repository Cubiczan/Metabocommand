# approval-queue-api

Thin HTTP wrap of the existing Metabocommand approval queue and action log.

## ADDED Requirements

### Requirement: List approvals over HTTP

The app SHALL expose `GET /api/approvals` that returns role-scoped approval
items (optional `status` filter), using the same tables and RLS as the
Approval Queue page.

#### Scenario: Unauthorized list

- GIVEN no session cookie and no Bearer JWT
- WHEN `GET /api/approvals` is called
- THEN the response is 401

### Requirement: List action log over HTTP

The app SHALL expose `GET /api/agent-log` that returns role-scoped action-log
rows using the same table as the Agent Action Log page.

#### Scenario: Authorized list

- GIVEN a valid finance user session
- WHEN `GET /api/agent-log` is called
- THEN only finance-queue rows are returned

### Requirement: Optional decision note

`POST /api/approvals/decide` SHALL accept an optional `note` and record it on
the existing agent action log reasoning field. Omitting `note` SHALL preserve
the previous dashboard payload.

#### Scenario: Approve with a note

- GIVEN a pending item and an authorized user
- WHEN decide is called with `note`
- THEN the action-log Decision row includes that note
