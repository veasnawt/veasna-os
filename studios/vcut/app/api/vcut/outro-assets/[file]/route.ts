import fs from "fs";
import { OUTRO_BG_FILE, OUTRO_LOGO_FILE } from "@veasnawt/vcut/src/export/outro";
import { outroBackgroundPath, outroLogoPath } from "../../_lib/outroAssets";
import { publicAssetRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves the SAME two bundled PNGs `export/route.ts`'s own outro render reads off disk server-side,
 *  to the browser — same `publicAssetRoute` convention as `fonts/[file]`, and for the same reason:
 *  `Preview.tsx`'s live preview of the outro (see its own `mediaUrlFor` special-case for
 *  `OUTRO_LOGO_ASSET_ID`/`OUTRO_BG_ASSET_ID`) needs a real, fetchable URL for the exact same images
 *  the export will actually use, not a second, separately-maintained copy. `[file]` is checked against
 *  the two known filenames `outro.ts` exports, never treated as a raw filesystem path — same
 *  "nothing here for a crafted request to escape with" reasoning `fonts/[file]`'s own comment gives. */
const FILE_TO_PATH: Record<string, () => string> = {
  [OUTRO_LOGO_FILE]: outroLogoPath,
  [OUTRO_BG_FILE]: outroBackgroundPath,
};

export const GET = publicAssetRoute(async (_req, context: { params: Promise<{ file: string }> }) => {
  const { file } = await context.params;
  const resolvePath = FILE_TO_PATH[file];
  if (!resolvePath) throw new ApiError(404, "Unknown outro asset", "outro-asset-not-found");

  const filePath = resolvePath();
  const stat = fs.statSync(filePath);

  return new Response(new Uint8Array(fs.readFileSync(filePath)), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(stat.size),
      // Bundled app assets, never user content that could change under this URL — safe to cache
      // aggressively, same convention `fonts/[file]` already uses for the same reason.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
