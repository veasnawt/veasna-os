import fs from "fs";
import path from "path";
import { ApiError } from "./paths";

// Deliberately its own file, not folded into ffmpeg.ts — same scope reasoning as `sfx.ts`'s own doc
// comment: these bundled images are never resolved through a project's own media directory (a placed
// clip's normal `relPath` lookup), only through `export/route.ts`'s `inputPathFor` special-casing the
// two synthetic outro clips it appends. Keeping that one narrow concern out of `ffmpeg.ts` keeps that
// file's scope to things FFmpeg/export generically read.
//
// The background is a bundled 64×64 solid-black PNG, not `Asset.kind === "color"` (a lavfi-generated
// matte with no backing file at all, per that field's own doc comment) — confirmed LIVE that
// `buildExportPlan` does NOT actually have the "equivalent export-time branch" that comment claims:
// `kind === "color"` is treated identically to a real image (`isImage = kind === "image" || kind ===
// "color"`) and its `path` still comes from `inputPathFor`, which has nothing real to return for a
// color matte's empty `relPath`. A real hosted export with a plain user-placed color-background clip
// hits this exact "Error opening input: Is a directory" failure — a genuine, pre-existing gap in that
// feature for hosted mode specifically, not something this outro feature introduced, just the first
// thing to actually exercise it. Worth fixing properly in `buildExportPlan.ts` itself at some point;
// sidestepped here by using a plain bundled image instead, which is already known to work correctly
// (the logo below uses the same mechanism). A flat black image scales/letterboxes to any sequence
// size or aspect ratio and still reads as a solid black frame either way, so its own fixed 64×64 size
// is irrelevant to how it looks in the final render.

let imagesDir: string | null = null;

/** Same packaged-vs-dev resolution as `sfx.ts`'s `resolveSfxDir`/`ffmpeg.ts`'s `resolveFontsDir` — a
 *  packaged desktop build isn't expected to carry this (the outro is hosted-only, gated entirely by
 *  `shouldIncludeOutro` in `export/route.ts`), but resolving the same way regardless costs nothing and
 *  means this function never has to know which build it's running in. */
function resolveImagesDir(): string {
  if (!imagesDir) {
    const packaged = path.join(process.cwd(), "vcut-images");
    imagesDir = fs.existsSync(packaged) ? packaged : path.resolve(process.cwd(), "../../packages/vcut/assets/images");
  }
  return imagesDir;
}

function bundledImagePath(fileName: string): string {
  const full = path.join(resolveImagesDir(), fileName);
  if (!fs.existsSync(full)) {
    throw new ApiError(500, `Bundled outro image is missing: ${fileName}`, "outro-image-missing");
  }
  return full;
}

/** Absolute path to the bundled outro logo image — 1254×1254 (see `export/route.ts`'s
 *  `OUTRO_LOGO_WIDTH`/`OUTRO_LOGO_HEIGHT`, confirmed directly by reading the PNG's own IHDR chunk
 *  rather than assumed), transparent background. */
export function outroLogoPath(): string {
  return bundledImagePath("vcut-transparent.png");
}

/** Absolute path to the bundled solid-black outro background — see this file's own top comment for
 *  why this is a real bundled image rather than `Asset.kind === "color"`. */
export function outroBackgroundPath(): string {
  return bundledImagePath("vcut-outro-bg.png");
}
