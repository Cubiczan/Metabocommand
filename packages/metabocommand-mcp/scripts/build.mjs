import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outfile = resolve(root, "dist/index.js");

mkdirSync(resolve(root, "dist"), { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile,
  external: ["@modelcontextprotocol/sdk", "zod"],
  alias: {
    "@": resolve(root, "../../src"),
  },
  logLevel: "info",
});

const bundled = readFileSync(outfile, "utf8");
const withShebang = bundled.startsWith("#!") ? bundled : `#!/usr/bin/env node\n${bundled}`;
writeFileSync(outfile, withShebang);
chmodSync(outfile, 0o755);
writeFileSync(resolve(root, "dist/package.json"), JSON.stringify({ type: "module" }));
