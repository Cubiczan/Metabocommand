/**
 * Reuse the repo TypeScript resolution hooks so MCP tests can import
 * `src/lib/hitl` via the `@/` alias.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const hooks = resolve(import.meta.dirname, "../../../tests/ts-resolve-hooks.mjs");
register(pathToFileURL(hooks).href, import.meta.url);
