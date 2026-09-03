import fs from "fs";
import path from "path";
import { ApiError } from "./paths";

// Deliberately its own file, not folded into ffmpeg.ts alongside `resolveFontsDir`/`textFontPath`:
// nothing in the FFmpeg export path ever touches an SFX file server-side by path — a placed SFX clip
// is, by the time export runs, a completely ordinary imported `Asset` referenced by its own copied
// `relPath` under the project's media directory, same as any dragged-in audio file (see
// `packages/vcut/src/project/sfx.ts`'s own doc comment). The ONLY server-side consumer of this
// bundled folder is the browser-serving route below — `[file]/route.ts` — so keeping this separate
// from ffmpeg.ts keeps that file's own scope (things FFmpeg/export actually read) honest.

let sfxDir: string | null = null;

/** The bundled SFX files live in the package's own source tree (`packages/vcut/assets/sfx`) — same
 *  packaged-vs-dev resolution as `ffmpeg.ts`'s `resolveFontsDir` (see its own comment for why
 *  `require.resolve` against `@veasnawt/vcut` can't be used here once this app's `transpilePackages`
 *  bundles that package's source directly into the Next.js build): a packaged desktop build gets a
 *  `vcut-sfx` directory copied in as a sibling of `server.js` (see
 *  `apps/vcut-desktop/scripts/build-resources.mjs`'s `ensureSfxAssets`), while dev/`next start`
 *  resolves straight to the source package relative to `process.cwd()` (always studios/vcut in
 *  that case). */
function resolveSfxDir(): string {
  if (!sfxDir) {
    const packaged = path.join(process.cwd(), "vcut-sfx");
    sfxDir = fs.existsSync(packaged) ? packaged : path.resolve(process.cwd(), "../../packages/vcut/assets/sfx");
  }
  return sfxDir;
}

/** Absolute path to a bundled SFX FILE by name — which file to ask for is decided entirely by
 *  `@veasnawt/vcut`'s own registry (`project/sfx.ts`'s `SFX_REGISTRY`); this function's only job is
 *  turning that filename into a real path on disk, same division of labor as `textFontPath`. */
export function sfxAssetPath(file: string): string {
  const full = path.join(resolveSfxDir(), file);
  if (!fs.existsSync(full)) {
    throw new ApiError(500, `Bundled SFX file is missing: ${file}`, "sfx-missing");
  }
  return full;
}
