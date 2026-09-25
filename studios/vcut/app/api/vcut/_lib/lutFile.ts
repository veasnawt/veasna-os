import fs from "fs";
import path from "path";
import { blendLut3D, normalizeLutIntensity, parseCubeLut, serializeCubeLut } from "@veasnawt/vcut/src/timeline/lut";
import { resolveWithin } from "./paths";

/** The `.cube` file FFmpeg's `lut3d` should read for a clip: the imported file itself at full strength, or
 *  — for a clip whose `lutIntensity` is below 1 — a copy with the lattice blended toward identity written
 *  into `scratchDir` (cached per lut+intensity, so several clips sharing a setting share one file). The
 *  same `blendLut3D` the live preview samples, so the exported look matches what was on screen. Returns
 *  `undefined` when the id no longer resolves to a library entry (the export just skips the stage, as it
 *  always has for a deleted LUT). */
export function resolveLutFilePath(
  paths: { lutsDir: string },
  luts: { id: string; relPath: string }[],
  lutId: string,
  intensity: number | undefined,
  scratchDir: string
): string | undefined {
  const lut = luts.find((l) => l.id === lutId);
  if (!lut) return undefined;
  const source = resolveWithin(paths.lutsDir, lut.relPath);
  const k = normalizeLutIntensity(intensity);
  if (k >= 1) return source;
  const blendedPath = path.join(scratchDir, `lut-${lutId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Math.round(k * 100)}.cube`);
  if (!fs.existsSync(blendedPath)) {
    fs.writeFileSync(blendedPath, serializeCubeLut(blendLut3D(parseCubeLut(fs.readFileSync(source, "utf8")), k)), "utf8");
  }
  return blendedPath;
}
