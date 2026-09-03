# Publish checklist — Metabocommand MCP

Do **not** publish from a feature agent run. This file is the later npm / MCP
Registry / PyPI checklist.

Intended names:

- npm: `@cubiczan/metabocommand-mcp`
- MCP Registry: `io.github.cubiczan/metabocommand-mcp`
- PyPI (later, not shipped here): `cubiczan-metabocommand-mcp`

## 1) npm (requires Cubiczan org OTP)

```bash
cd packages/metabocommand-mcp
npm whoami          # expect: cubiczan
npm publish --access public
npm view @cubiczan/metabocommand-mcp version
```

## 2) Official MCP Registry

```bash
mcp-publisher login github
cd packages/metabocommand-mcp
mcp-publisher publish
```

## 3) Cursor / Claude one-liners (after npm)

```json
{
  "mcpServers": {
    "metabocommand": { "command": "npx", "args": ["-y", "@cubiczan/metabocommand-mcp"] },
    "chp": { "command": "npx", "args": ["-y", "@cubiczan/chp-mcp"] }
  }
}
```

```bash
claude mcp add metabocommand -- npx -y @cubiczan/metabocommand-mcp
```

## 4) PyPI (follow-up)

A Python stdio transport can wrap the same HITL service later. Do not invent a
second workflow engine. Publish only after the Node server is the source of
truth for tool names and fixtures.
