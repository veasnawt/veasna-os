import path from "node:path";

/** Packaged layout: resourcesPath/vcut/server.js, with .next/static and public/ copied in
 *  alongside it — produced by apps/vcut-desktop/scripts/build-resources.mjs (run as part of
 *  `pnpm package`) from studios/vcut's own `next build` (output: "standalone"). Only meaningful
 *  when app.isPackaged is true; dev mode never touches this path (see main.ts). */
export function resolveServerJsPath(resourcesPath: string): string {
  return path.join(resourcesPath, "vcut", "server.js");
}
