import { build, context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

// CJS output (not ESM) — the simplest, most compatible target for Electron's main process, no
// "type": "module" interop concerns to work around.
const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

const mainEntry = path.join(__dirname, "src/main.ts");
const mainOutfile = path.join(__dirname, "dist/main.cjs");
// The one privileged bridge this app exposes (see preload.ts's own doc comment for what and why) —
// built as its own separate output alongside main.cjs. Was written but never actually wired up
// (createMainWindow.ts never set `webPreferences.preload`, and this file was never built at all) until
// the desktop sign-in flow needed a real one; see that file's own comment.
const preloadEntry = path.join(__dirname, "src/preload.ts");
const preloadOutfile = path.join(__dirname, "dist/preload.cjs");

async function run() {
  if (watch) {
    const mainCtx = await context({ ...shared, entryPoints: [mainEntry], outfile: mainOutfile });
    const preloadCtx = await context({ ...shared, entryPoints: [preloadEntry], outfile: preloadOutfile });
    await Promise.all([mainCtx.watch(), preloadCtx.watch()]);
    console.log("esbuild watching apps/vcut-desktop/src for changes...");
  } else {
    await Promise.all([
      build({ ...shared, entryPoints: [mainEntry], outfile: mainOutfile }),
      build({ ...shared, entryPoints: [preloadEntry], outfile: preloadOutfile }),
    ]);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
