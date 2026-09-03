/**
 * @cubiczan/metabocommand-mcp — stdio MCP entrypoint.
 *
 * npx -y @cubiczan/metabocommand-mcp
 * Default mode is demo (seed fixtures, no running dashboard).
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

const server = createServer();
const transport = new StdioServerTransport();

function shutdown(): void {
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("end", shutdown);

await server.connect(transport);
