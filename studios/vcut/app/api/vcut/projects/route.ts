import fs from "fs";
import path from "path";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import { localRoute } from "../_lib/localOnly";
import { VCUT_ROOT } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clipCount: number;
  width: number;
  height: number;
  /** What the home page's grid card should show as a preview image, if anything — resolved here
   *  (not left for the client to guess) since only the server knows which asset, if any, actually has
   *  a rendered thumbnail file on disk. `kind` picks which `/api/vcut/media/raw` folder to read
   *  from: a video's OWN thumbnail lives in the thumbnails dir, but a still image has none of its own
   *  (see `media/route.ts`'s import route) and is read straight from the media dir instead. */
  thumbnail?: { relPath: string; kind: "thumbnail" | "media" };
}

/** Lists every project VCut knows about — what the standalone home page (`/`) shows, so VCut
 *  is usable without a host app (BP Studio, previously the only way to reach an existing project —
 *  it kept its own separate list in localStorage and always knew which id to open) handing in an id.
 *
 *  Scans `VCUT_ROOT` directly rather than keeping a separate index file: the project folders
 *  ARE the source of truth already (see `_lib/paths.ts`), and a directory listing is cheap enough
 *  at the scale a local video editor's project count ever reaches that a second, always-at-risk-of-
 *  drifting index isn't worth maintaining. A folder whose `project.json` fails to parse (corrupted,
 *  or mid-write) is skipped rather than failing the whole list — one bad project shouldn't hide
 *  every other one. */
export const GET = localRoute(async () => {
  if (!fs.existsSync(VCUT_ROOT)) return Response.json({ projects: [] });

  const summaries: ProjectSummary[] = [];
  for (const entry of fs.readdirSync(VCUT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectFile = path.join(VCUT_ROOT, entry.name, "project.json");
    if (!fs.existsSync(projectFile)) continue;
    try {
      const project = deserializeProject(fs.readFileSync(projectFile, "utf8"));

      // A video's own generated thumbnail is preferred; a still image has none of its own and is read
      // straight from the media folder instead (see media/route.ts's import route). Audio-only/empty
      // projects fall through to `undefined` — the card renders a placeholder for those.
      const thumbnailAsset =
        project.assets.find((a) => a.kind === "video" && a.thumbnailRelPath) ??
        project.assets.find((a) => a.kind === "image");
      const thumbnail: ProjectSummary["thumbnail"] = !thumbnailAsset
        ? undefined
        : thumbnailAsset.kind === "video"
          ? { relPath: thumbnailAsset.thumbnailRelPath!, kind: "thumbnail" }
          : { relPath: thumbnailAsset.relPath, kind: "media" };

      summaries.push({
        id: project.bpProjectId,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        clipCount: project.sequence.tracks.reduce((n, t) => n + t.clips.length, 0),
        width: project.sequence.width,
        height: project.sequence.height,
        thumbnail,
      });
    } catch {
      // Skip — see the function comment above.
    }
  }

  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return Response.json({ projects: summaries });
});
