import { SFX_REGISTRY } from "@veasnawt/vcut/src/project/sfx";
import { SFX_METADATA } from "@veasnawt/vcut/src/project/sfxMetadata.generated";
import fs from "fs";
import { sfxAssetPath } from "../../_lib/sfx";
import { publicAssetRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves one bundled `SFX_REGISTRY` catalog entry's audio file, OR its pre-generated waveform PNG
 *  (`SFX_METADATA[file].waveformFile` — a plain sibling file in the same `assets/sfx/` directory, not
 *  a separate route/dir of its own; see `sfxMetadata.generated.ts`'s own doc comment), to the browser —
 *  same "`[file]` checked against a known-filenames set, never treated as a raw filesystem path" shape
 *  as `fonts/[file]/route.ts`, for the identical reason (nothing here for a crafted request to escape
 *  with). */
const ALLOWED_FILES = new Map<string, "audio" | "waveform">([
  ...SFX_REGISTRY.map((sfx): [string, "audio"] => [sfx.file, "audio"]),
  ...Object.values(SFX_METADATA).map((m): [string, "waveform"] => [m.waveformFile, "waveform"]),
]);

export const GET = publicAssetRoute(async (_req, context: { params: Promise<{ file: string }> }) => {
  const { file } = await context.params;
  const type = ALLOWED_FILES.get(file);
  if (!type) throw new ApiError(404, "Unknown SFX file", "sfx-not-found");

  const filePath = sfxAssetPath(file);
  const stat = fs.statSync(filePath);

  return new Response(new Uint8Array(fs.readFileSync(filePath)), {
    status: 200,
    headers: {
      "Content-Type": type === "waveform" ? "image/png" : "audio/mpeg",
      "Content-Length": String(stat.size),
      // Bundled app assets, never user content that could change under this URL — safe to cache
      // aggressively, same reasoning as fonts/[file]/route.ts's identical header.
      "Cache-Control": "public, max-age=31536000, immutable",
      // The native (Capacitor) shell now calls this cross-origin (`client.ts`'s `sfxAssetUrl` resolves
      // to an absolute `https://vcut.io` URL there, having no server of its own to serve a relative one
      // from) — an `<audio src>` never needed this, but `SfxPanel.tsx`'s own `fetch().blob()` fallback
      // and native export's own file-download DO: a plain cross-origin `fetch()` reading the response
      // body is blocked without it. Safe unconditionally, same reasoning `withCors` (`_lib/localOnly.ts`)
      // already gives for billing: this is bearer-token-free, fully public, identical content for every
      // caller — nothing here a permissive origin could leak.
      "Access-Control-Allow-Origin": "*",
    },
  });
});
