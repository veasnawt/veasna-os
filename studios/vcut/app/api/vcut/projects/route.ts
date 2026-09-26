import fs from "fs";
import path from "path";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import type { Project } from "@veasnawt/vcut/src/project/types";
import { listProjectsForOwner, requireSessionUser, VCUT_HOSTED } from "../_lib/auth";
import { localRoute } from "../_lib/localOnly";
import { projectPaths, VCUT_ROOT } from "../_lib/paths";
import { resolveCoverAsset } from "../_lib/projectIndex";

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
   *  (see `media/route.ts`'s import route) and is read straight from the media dir instead. `library`
   *  mirrors `Asset.libraryMediaId`'s own doc comment — set when the chosen asset's real file actually
   *  lives in the OWNER's account-wide library (`users/<id>/...`) rather than this project's own
   *  folder, telling `/api/vcut/media/raw` which directory to actually resolve `relPath` against (see
   *  that route's own `library=1` handling). Every hosted-mode upload/generation/stock download has
   *  gone through the account-wide library since that feature shipped, so this is the COMMON case, not
   *  an edge one — omitting it produced a broken thumbnail for most real projects, not just template
   *  ones (a real, reported bug: the browser's own "image failed to load" icon, not this app's own
   *  "no thumbnail yet" placeholder, since the URL pointed at a real-looking but wrong path). */
  thumbnail?: { relPath: string; kind: "thumbnail" | "media"; library: boolean };
}

/** Shared by both branches below — the local one (reading straight off a directory listing) and the
 *  hosted one (reading off `projects_index`'s own list of ids) both end up needing to turn one
 *  `project.json` into a `ProjectSummary` the exact same way. */
function summarize(project: Project): ProjectSummary {
  // A custom cover (`ExportSettings.cover`'s own doc comment) wins outright when one's been picked — a
  // real, reported gap otherwise: picking a Cover in the editor only ever affected the EXPORTED file's
  // own embedded thumbnail, never what this same project showed on its own list card here, so the two
  // could disagree even though the user had explicitly set one of them. `resolveCoverAsset` (shared with
  // `_lib/projectIndex.ts`'s own project-summary caching layer, which already got this right) resolves
  // an `image` cover directly, or — for a `frame` cover, which would need the fully COMPOSITED render
  // `export/route.ts` only produces once an export actually runs — approximates it by finding whichever
  // clip is playing at that timeline moment and reusing THAT asset's own already-generated thumbnail:
  // not frame-exact, but a real, relevant preview instead of an unrelated one, with zero new
  // thumbnail-generation work.
  const coverAsset = resolveCoverAsset(project);
  // A video's own generated thumbnail is preferred; a still image has none of its own and is read
  // straight from the media folder instead (see media/route.ts's import route). Audio-only/empty
  // projects fall through to `undefined` — the card renders a placeholder for those.
  //
  // `!a.templatePlaceholder` on both — a real, reported bug: a template-based project not yet fully
  // filled in still has video/image PLACEHOLDER assets sitting in `project.assets` (no real file at
  // all, `relPath: ""` — see `Asset.templatePlaceholder`'s own doc comment), and the image fallback
  // specifically had nothing else guarding against matching one of those, producing a thumbnail that
  // pointed at an empty path instead of correctly falling through to "no thumbnail yet."
  const thumbnailAsset =
    coverAsset ??
    project.assets.find((a) => a.kind === "video" && a.thumbnailRelPath && !a.templatePlaceholder) ??
    project.assets.find((a) => a.kind === "image" && !a.templatePlaceholder);
  const thumbnail: ProjectSummary["thumbnail"] = !thumbnailAsset
    ? undefined
    : thumbnailAsset.kind === "video"
      ? { relPath: thumbnailAsset.thumbnailRelPath!, kind: "thumbnail", library: Boolean(thumbnailAsset.libraryMediaId) }
      : { relPath: thumbnailAsset.relPath, kind: "media", library: Boolean(thumbnailAsset.libraryMediaId) };

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
