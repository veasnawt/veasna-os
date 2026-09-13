import type { Asset } from "@veasnawt/vcut/src/project/types";
import { sfxAssetPath } from "./sfx";
import { resolveWithin, type ProjectPaths } from "./paths";

/** Resolves the real, absolute file path FFmpeg (or anything else server-side) should read for a
 *  given asset — the one place that has to know about every "this asset's real bytes don't live in
 *  this project's own mediaDir" exception that's accumulated over time: `Asset.bundledSfx` (the app's
 *  own shared, immutable catalog — never copied anywhere, see that field's own doc comment) and
 *  `Asset.libraryMediaId` (the owner's account-wide library, see that field's own doc comment).
 *  Anything with neither resolves against the project's own `mediaDir`, the plain default every asset
 *  had before either of those special cases existed. Shared by `export/route.ts`'s own `inputPathFor`
 *  and `_lib/templates.ts`'s template-preview renderer — both need the identical three-way
 *  resolution, and duplicating it was already an awkward temptation the moment the second caller
 *  showed up. `libraryMediaDir` is `null` on desktop/local dev, where the library concept doesn't
 *  exist at all and `libraryMediaId` is consequently never set on any asset there. */
export function resolveAssetInputPath(paths: ProjectPaths, libraryMediaDir: string | null, asset: Asset): string {
  if (asset.bundledSfx) return sfxAssetPath(asset.relPath);
  const dir = asset.libraryMediaId && libraryMediaDir ? libraryMediaDir : paths.mediaDir;
  return resolveWithin(dir, asset.relPath);
}
