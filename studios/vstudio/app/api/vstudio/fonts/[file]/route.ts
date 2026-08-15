import fs from "fs";
import { FONT_REGISTRY } from "@veasna/vstudio/src/project/fonts";
import { textFontPath } from "../../_lib/ffmpeg";
import { localRoute } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves the SAME bundled font files `buildExportPlan`'s `drawtext` reads server-side, to the
 *  browser — registered as `@font-face` in globals.css so the preview's canvas and the exported
 *  video draw text from the identical font file, not just the same family name. `[file]` is checked
 *  against the registry's own set of known filenames (every file every bundled font actually ships),
 *  never treated as a raw filesystem path, so there's nothing here for a crafted request to escape
 *  with — unlike `media/raw`, which resolves genuinely user-controlled `relPath` values and needs
 *  `resolveWithin`'s containment check for exactly that reason. */
const ALLOWED_FILES = new Set(FONT_REGISTRY.flatMap((font) => Object.values(font.files)));

export const GET = localRoute(async (_req, context: { params: Promise<{ file: string }> }) => {
  const { file } = await context.params;
  if (!ALLOWED_FILES.has(file)) throw new ApiError(404, "Unknown font file", "font-not-found");

  const filePath = textFontPath(file);
  const stat = fs.statSync(filePath);

  return new Response(new Uint8Array(fs.readFileSync(filePath)), {
    status: 200,
    headers: {
      "Content-Type": "font/ttf",
      "Content-Length": String(stat.size),
      // Fonts are static, bundled app assets, never user content that could change under this URL —
      // safe to cache aggressively, unlike media/raw's deliberate `no-store`.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
