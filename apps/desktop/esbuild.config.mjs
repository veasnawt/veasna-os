import { build, context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

// CJS output (not ESM) — the simplest, most compatible target for Electron's main process and
// preload scripts, no "type": "module" interop concerns to work around.
const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

const entries = [
  { entry: path.join(__dirname, "src/main.ts"), outfile: path.join(__dirname, "dist/main.cjs") },
  { entry: path.join(__dirname, "src/preload.ts"), outfile: path.join(__dirname, "dist/preload.cjs") },
];

async function run() {
  if (watch) {
    for (const { entry, outfile } of entries) {
      const ctx = await context({ ...shared, entryPoints: [entry], outfile });
      await ctx.watch();
    }
    console.log("esbuild watching apps/desktop/src for changes...");
  } else {
    for (const { entry, outfile } of entries) {
      await build({ ...shared, entryPoints: [entry], outfile });
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
