import { build, context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

// CJS output (not ESM) — the simplest, most compatible target for Electron's main process, no
// "type": "module" interop concerns to work around. No preload script here (unlike apps/desktop) —
// VStudio's own renderer needs no privileged bridge, it only ever talks to its own bundled Next.js
// server over plain fetch, exactly like it does in a browser tab.
const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

const entry = path.join(__dirname, "src/main.ts");
const outfile = path.join(__dirname, "dist/main.cjs");

async function run() {
  if (watch) {
    const ctx = await context({ ...shared, entryPoints: [entry], outfile });
    await ctx.watch();
    console.log("esbuild watching apps/vstudio-desktop/src for changes...");
  } else {
    await build({ ...shared, entryPoints: [entry], outfile });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
