// Development only. Keep the published plugin independent of npm and platform binaries.
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const { outputFiles } = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ["scripts/thumbnail-worker.mjs"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  target: "node20",
  legalComments: "inline",
});
// Paseo bundles server entries in memory. Embed the worker so it has no runtime file paths.
const lines = outputFiles[0].text.trimEnd().split("\n");
await writeFile(
  new URL("server/generated/thumbnail-worker.json", root),
  JSON.stringify(lines, null, 2) + "\n",
);

const licenses = [];
for (const [name, file] of [
  ["@cf-wasm/photon", "LICENSE.md"],
  ["@cf-wasm/internals", "LICENSE.md"],
  ["image-size", "LICENSE"],
]) {
  const license = await readFile(
    new URL("node_modules/" + name + "/" + file, root),
    "utf8",
  );
  licenses.push(name + "\n\n" + license.trim());
}
await writeFile(
  new URL("server/generated/LICENSES.txt", root),
  licenses.join("\n\n") + "\n",
);
