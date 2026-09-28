import type { Project } from "@veasnawt/vcut/src/project/types";

/** A reviewer can fetch only project-referenced media. In particular, a
 * library-backed asset must not become a path to the owner's entire library. */
export function canReadReviewMedia(project: Project, kind: string, relPath: string, library: boolean): boolean {
  if (kind === "media" || kind === "thumbnail") {
    return project.assets.some((asset) => Boolean(asset.libraryMediaId) === library &&
      (kind === "media"
        ? [asset.relPath, asset.proxyRelPath]
        : [asset.thumbnailRelPath, asset.filmstripRelPath, asset.waveformRelPath, asset.animation?.spriteRelPath]
      ).includes(relPath));
  }
  if (library) return false;
  if (kind === "lut") return project.luts.some((lut) => lut.relPath === relPath);
  if (kind === "customFont") return project.customFonts.some((font) => font.relPath === relPath);
  if (kind === "customSfx") return project.customSfx.some((sfx) => sfx.relPath === relPath);
  return false;
}
