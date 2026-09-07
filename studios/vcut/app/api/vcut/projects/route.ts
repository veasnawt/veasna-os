import fs from "fs";
import path from "path";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import type { Project } from "@veasnawt/vcut/src/project/types";
import { listProjectsForOwner, requireSessionUser, VCUT_HOSTED } from "../_lib/auth";
import { localRoute } from "../_lib/localOnly";
import { projectPaths, VCUT_ROOT } from "../_lib/paths";

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

/** Shared by both branches below — the local one (reading straight off a directory listing) and the
 *  hosted one (reading off `projects_index`'s own list of ids) both end up needing to turn one
 *  `project.json` into a `ProjectSummary` the exact same way. */
function summarize(project: Project): ProjectSummary {
  // A video's own generated thumbnail is preferred; a still image has none of its own and is read
  // straight from the media folder instead (see media/route.ts's import route). Audio-only/empty
  // projects fall through to `undefined` — the card renders a placeholder for those.
  const thumbnailAsset =
    project.assets.find((a) => a.kind === "video" && a.thumbnailRelPath) ?? project.assets.find((a) => a.kind === "image");
  const thumbnail: ProjectSummary["thumbnail"] = !thumbnailAsset
    ? undefined
    : thumbnailAsset.kind === "video"
      ? { relPath: thumbnailAsset.thumbnailRelPath!, kind: "thumbnail" }
      : { relPath: thumbnailAsset.relPath, kind: "media" };

  return {
    id: project.bpProjectId,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    clipCount: project.sequence.tracks.reduce((n, t) => n + t.clips.length, 0),
    width: project.sequence.width,
    height: project.sequence.height,
    thumbnail,
  };
}

/** Lists every project the current caller can see — what the standalone home page (`/`) shows.
 *
 *  Local/desktop (unchanged): scans `VCUT_ROOT` directly rather than keeping a separate index file —
 *  the project folders ARE the source of truth already (see `_lib/paths.ts`), and a directory listing
 *  is cheap enough at the scale a local video editor's project count ever reaches that a second,
 *  always-at-risk-of-drifting index isn't worth maintaining there. A folder whose `project.json` fails
 *  to parse (corrupted, or mid-write) is skipped rather than failing the whole list — one bad project
 *  shouldn't hide every other one.
 *
 *  Hosted (`VCUT_HOSTED`): the same "scan everything" approach would mean reading every OTHER
 *  tenant's files just to filter them back out — instead, `projects_index` (kept in sync by
 *  `project/route.ts`'s own POST/PUT/DELETE) already knows exactly which project ids this user owns,
 *  so this only ever reads THIS user's own `project.json` files. */
export const GET = localRoute(async (req) => {
  if (VCUT_HOSTED) {
    const user = await requireSessionUser(req);
    const rows = await listProjectsForOwner(user.id);
    const summaries: ProjectSummary[] = [];
    for (const row of rows) {
      const paths = projectPaths(row.id);
      if (!fs.existsSync(paths.projectFile)) continue; // index/disk drift — skip, don't fail the list
      try {
        summaries.push(summarize(deserializeProject(fs.readFileSync(paths.projectFile, "utf8"))));
      } catch {
        // Skip — see the function comment above.
      }
    }
    return Response.json({ projects: summaries });
  }

  if (!fs.existsSync(VCUT_ROOT)) return Response.json({ projects: [] });

  const summaries: ProjectSummary[] = [];
  for (const entry of fs.readdirSync(VCUT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectFile = path.join(VCUT_ROOT, entry.name, "project.json");
    if (!fs.existsSync(projectFile)) continue;
    try {
      summaries.push(summarize(deserializeProject(fs.readFileSync(projectFile, "utf8"))));
    } catch {
      // Skip — see the function comment above.
    }
  }

  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return Response.json({ projects: summaries });
});
