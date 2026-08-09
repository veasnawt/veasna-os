import path from "node:path";

/** Packaged layout: resourcesPath/<resourceName>/server.js, with .next/static and public/ copied
 *  in alongside it — produced by apps/desktop/scripts/build-resources.mjs (run as part of `pnpm
 *  package`/`build:desktop`) from the app's own `next build` (output: "standalone"). Only
 *  meaningful when app.isPackaged is true; dev mode never touches this path (see main.ts).
 *  `resourceName` matches the `outName` passed to build-resources.mjs's
 *  buildNextStandaloneResources — "universe" or "bp" today. */
export function resolveServerJsPath(resourcesPath: string, resourceName: string): string {
  return path.join(resourcesPath, resourceName, "server.js");
}
