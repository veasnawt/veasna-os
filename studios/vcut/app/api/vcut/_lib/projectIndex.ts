import fs from "fs";
import path from "path";
import { deserializeProject } from "@veasnawt/vcut/src/project/serialize";
import type { Asset, Project } from "@veasnawt/vcut/src/project/types";
import { clipAtTime } from "@veasnawt/vcut/src/timeline/queries";
import { VCUT_ROOT, projectPaths } from "./paths";

export interface ProjectSummary {
  id: string;
  name: string;
  /** Precomputed once here (index-build/update time) rather than in the list route's search filter,
   *  so a `q=` search never re-lowercases every project's name on every request. */
  nameLower: string;
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

/** The whole point of this module: a project list that used to cost one full `deserializeProject`
 *  parse (every asset, every clip) PER PROJECT PER REQUEST — 20-90+ seconds with hundreds of real
 *  projects on disk — now costs that parse once per project, ever (or once per save). Each project
 *  directory gets a small `summary.json` sidecar next to its `project.json`, and this in-memory Map
 *  caches all of them for the life of the process.
 *
 *  Deliberately NOT one shared `.index.json` file: a shared file would need read-modify-write
 *  coordination across concurrent saves of different projects (two saves racing to rewrite the same
 *  file can clobber each other). A per-project sidecar mirrors `project.json`'s own write granularity
 *  — each project only ever touches its own file — and self-heals per-directory if it goes missing or
 *  stale (see `loadOneSummary` below), with no cross-project coordination needed at all.
 *
 *  Also deliberately NOT Redis/a shared cache: this is a single local dev/prod Node process, not a
 *  distributed deployment, so a plain module-level Map already gives every request the same warm
 *  cache for free. `null` until the first `getIndex()` call hydrates it — hydration happens lazily
 *  rather than at module load so importing this module (e.g. from `project/route.ts` just to call
 *  `upsertSummary`) never pays for a full directory scan it doesn't need. */
let cache: Map<string, ProjectSummary> | null = null;

/** Resolves `project.exportSettings.cover` (if set) to a real `Asset` the caller can build a
 *  thumbnail reference from — `undefined` for every case `summaryFromProject` should fall through to
 *  its own ordinary default for: no cover set, an `image` cover whose asset has since been deleted, or
 *  a `frame` cover with no clip actually on screen at that instant (an empty video track, a gap) or
 *  whose resolved clip's own asset has no generated thumbnail yet. Never resolves a `frame` cover to
 *  an IMAGE-kind clip either — a still has no `thumbnailRelPath` of its own to approximate with here,
 *  only `summaryFromProject`'s own separate "read the image file directly" branch handles that shape,
 *  and only for the plain (non-cover) fallback case. */
function resolveCoverAsset(project: Project): Asset | undefined {
  const cover = project.exportSettings.cover;
  if (!cover) return undefined;
  if (cover.kind === "image") return project.assets.find((a) => a.id === cover.assetId);
  for (const track of project.sequence.tracks) {
    if (track.kind !== "video" || !track.visible) continue;
    const clip = clipAtTime(track, cover.time);
    if (!clip) continue;
    const asset = project.assets.find((a) => a.id === clip.assetId);
    if (asset?.kind === "video" && asset.thumbnailRelPath) return asset;
  }
  return undefined;
}

/** Derives a `ProjectSummary` from a fully-parsed `Project` — the one place this logic lives, shared
 *  by the cold-start fallback below and by `project/route.ts`, which calls this after every save so
 *  the sidecar it writes always matches what's actually on disk. */
export function summaryFromProject(project: Project): ProjectSummary {
  // A custom cover (see `ExportSettings.cover`'s own doc comment) wins outright when one's been
  // picked — a real, direct request: the card a project's own OWNER sees in their list should match
  // what the export itself will actually show, not some unrelated fallback frame. An `image` cover is
  // a real asset with no thumbnail of its own generated for it (same "read straight from the media
  // folder" treatment a still-image asset already gets below); a `frame` cover has no PRE-RENDERED
  // file for that exact instant sitting on disk anywhere (unlike export-time cover-art muxing, which
  // extracts a real frame from the fully-composited OUTPUT — this project may never have been
  // exported at all), so this approximates it with whichever clip is actually on screen at that
  // timeline moment and reuses THAT asset's own already-generated thumbnail — not frame-exact, but a
  // real, relevant preview rather than an unrelated one, and zero new thumbnail-generation work.
  const coverAsset = resolveCoverAsset(project);
  // A video's own generated thumbnail is preferred; a still image has none of its own and is read
  // straight from the media folder instead (see media/route.ts's import route). Audio-only/empty
  // projects fall through to `undefined` — the card renders a placeholder for those.
  const thumbnailAsset =
    coverAsset ??
    project.assets.find((a) => a.kind === "video" && a.thumbnailRelPath) ??
    project.assets.find((a) => a.kind === "image");
  const thumbnail: ProjectSummary["thumbnail"] = !thumbnailAsset
    ? undefined
    : thumbnailAsset.kind === "video"
      ? { relPath: thumbnailAsset.thumbnailRelPath!, kind: "thumbnail" }
      : { relPath: thumbnailAsset.relPath, kind: "media" };

  return {
    id: project.bpProjectId,
    name: project.name,
    nameLower: project.name.toLowerCase(),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    clipCount: project.sequence.tracks.reduce((n, t) => n + t.clips.length, 0),
    width: project.sequence.width,
    height: project.sequence.height,
    thumbnail,
  };
}

function summaryFilePath(projectId: string): string {
  return path.join(projectPaths(projectId).dir, "summary.json");
}

/** Same tmp-file-then-rename technique `project/route.ts`'s `PUT` handler uses for `project.json`
 *  itself — rename is atomic within a filesystem, so a crash mid-write can't leave a truncated
 *  `summary.json` on disk that `loadOneSummary`'s mtime check below would then treat as fresh. */
function writeSidecar(projectId: string, summary: ProjectSummary): void {
  const paths = projectPaths(projectId);
  fs.mkdirSync(paths.dir, { recursive: true });
  const file = summaryFilePath(projectId);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(summary), "utf8");
  fs.renameSync(tmp, file);
}

/** Reads one project directory's summary, preferring the cheap sidecar over a full parse of
 *  `project.json`. The sidecar is trusted only when it's at least as fresh as `project.json` (mtime
 *  comparison) — a save that manages to write a new `project.json` without also updating
 *  `summary.json` (an old build, a crash between the two writes, a hand-edited file) must not serve a
 *  stale summary forever. Falling back to the full parse self-heals it, and only once: the freshly
 *  derived summary is written back before returning, so the expensive parse never repeats for a
 *  project whose sidecar is merely missing or behind — which is exactly the state every one of the
 *  439 pre-existing projects is in the first time this runs after this change ships. */
function loadOneSummary(projectId: string): ProjectSummary | undefined {
  const paths = projectPaths(projectId);
  if (!fs.existsSync(paths.projectFile)) return undefined;

  const projectStat = fs.statSync(paths.projectFile);
  const sidecarPath = summaryFilePath(projectId);
  if (fs.existsSync(sidecarPath)) {
    const sidecarStat = fs.statSync(sidecarPath);
    if (sidecarStat.mtimeMs >= projectStat.mtimeMs) {
      try {
        return JSON.parse(fs.readFileSync(sidecarPath, "utf8")) as ProjectSummary;
      } catch {
        // Corrupted/truncated sidecar — fall through to the full parse below rather than hiding
        // the project or serving garbage.
      }
    }
  }

  try {
    const project = deserializeProject(fs.readFileSync(paths.projectFile, "utf8"));
    const summary = summaryFromProject(project);
    writeSidecar(projectId, summary);
    return summary;
  } catch {
    // Matches the list route's prior behavior: a folder whose project.json fails to parse
    // (corrupted, or mid-write) is skipped rather than failing the whole list.
    return undefined;
  }
}

/** Returns every known project's summary, hydrating the in-memory cache from disk on first call.
 *  Unordered (insertion order from the directory scan) — callers that care about ordering (the list
 *  route's `updatedAt` sort) sort the result themselves rather than this module baking in an opinion
 *  about it. */
export function getIndex(): ProjectSummary[] {
  if (!cache) {
    cache = new Map();
    if (fs.existsSync(VCUT_ROOT)) {
      for (const entry of fs.readdirSync(VCUT_ROOT, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const summary = loadOneSummary(entry.name);
        if (summary) cache.set(entry.name, summary);
      }
    }
  }
  return Array.from(cache.values());
}

/** Called right after `project/route.ts` writes a `project.json` (create-on-first-visit, `POST`, or
 *  `PUT`) so the in-memory index and the on-disk sidecar both reflect the save immediately — the next
 *  `getIndex()` call (i.e. the next home-page load, from any process restart too) sees it without
 *  ever re-parsing `project.json`. */
export function upsertSummary(projectId: string, summary: ProjectSummary): void {
  writeSidecar(projectId, summary);
  (cache ??= new Map()).set(projectId, summary);
}

/** Called right after `project/route.ts`'s `DELETE` handler removes a project directory. Tolerates
 *  `summary.json` already being gone — it lived inside the directory `DELETE` just removed
 *  recursively, so this unlink normally finds nothing, not a real second delete. */
export function removeSummary(projectId: string): void {
  cache?.delete(projectId);
  try {
    fs.unlinkSync(summaryFilePath(projectId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
