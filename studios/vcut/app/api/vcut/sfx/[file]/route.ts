import { SFX_REGISTRY } from "@veasnawt/vcut/src/project/sfx";
import fs from "fs";
import { sfxAssetPath } from "../../_lib/sfx";
import { publicAssetRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves one bundled `SFX_REGISTRY` catalog entry's audio file to the browser — same
 *  "`[file]` checked against a known-filenames set, never treated as a raw filesystem path" shape as
 *  `fonts/[file]/route.ts`, for the identical reason (nothing here for a crafted request to escape
 *  with). */
const ALLOWED_FILES = new Set(SFX_REGISTRY.map((sfx) => sfx.file));

export const GET = publicAssetRoute(async (_req, context: { params: Promise<{ file: string }> }) => {
  const { file } = await context.params;
  if (!ALLOWED_FILES.has(file)) throw new ApiError(404, "Unknown SFX file", "sfx-not-found");

  const filePath = sfxAssetPath(file);
  const stat = fs.statSync(filePath);

  return new Response(new Uint8Array(fs.readFileSync(filePath)), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(stat.size),
      // Bundled app assets, never user content that could change under this URL — safe to cache
      // aggressively, same reasoning as fonts/[file]/route.ts's identical header.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
