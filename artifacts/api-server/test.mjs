import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const names = ["campus-core", "social", "commerce"];
const output = path.join(here, ".test-build");
await build({
  entryPoints: names.map(name => path.join(here, `src/${name}.test.ts`)),
  outdir: output, outExtension: { ".js": ".mjs" }, bundle: true, platform: "node",
  format: "esm",
  // Preserve each workspace package's own pnpm dependency resolution.
  // Leaving bare external imports here incorrectly resolves them from api-server.
  plugins: [{
    name: "resolved-package-externals",
    setup(builder) {
      builder.onResolve({ filter: /^[^./]/ }, async args => {
        if (args.path.startsWith("@workspace/") || args.pluginData?.skipExternalResolver) return;
        const resolved = await builder.resolve(args.path, {
          kind: args.kind, resolveDir: args.resolveDir,
          pluginData: { skipExternalResolver: true },
        });
        return { path: resolved.path, external: true, errors: resolved.errors };
      });
    },
  }],
  alias: {
    "@workspace/db": path.resolve(here, "../../lib/db/src/index.ts"),
    "@workspace/api-zod": path.resolve(here, "../../lib/api-zod/src/index.ts"),
  },
});
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...names.map(name => path.join(output, `${name}.test.mjs`))], { stdio: "inherit" });
process.exit(result.status ?? 1);
