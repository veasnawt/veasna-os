/** Resolves VStudio's real origin for the Create page's `<iframe>` (see
 *  `app/projects/[id]/create/page.tsx`) — VStudio is now its own standalone app (`studios/vstudio`),
 *  not something bp hosts in-process.
 *
 *  `http://localhost:3002` matches VStudio's own `pnpm dev` port, exactly the same "hardcoded known
 *  dev port" convention `packages/universe/src/constants.ts`'s `CELESTIAL_BODIES.launchUrl`s already
 *  use for bp (3001) and gamedev (5173). In the packaged desktop app, VStudio's server is spawned on
 *  a dynamically-chosen loopback port instead — `apps/desktop/src/main.ts` passes the real resolved
 *  URL to bp's own spawned process as `VSTUDIO_URL`, read here.
 *
 *  This is a BP-side route (not a client-side Electron IPC lookup) because BP's own renderer runs
 *  inside a `<webview>` that has no access to Universe's `window.veasnaStudios` bridge — that bridge
 *  is only attached to the top-level main window's preload. Resolving the port server-side, the same
 *  way `RIXIE_MEMORY_DB` is threaded into studios/universe at spawn time, sidesteps needing a second
 *  bridge/IPC mechanism just for this. */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ url: process.env.VSTUDIO_URL ?? "http://localhost:3002" });
}
