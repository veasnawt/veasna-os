import fs from "fs";
import path from "path";
import { deserializeProject } from "@veasna/vstudio/src/project/serialize";
import { localRoute } from "../_lib/localOnly";
import { VSTUDIO_ROOT } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clipCount: number;
}

/** Lists every project VStudio knows about — what the standalone home page (`/`) shows, so VStudio
 *  is usable without a host app (BP Studio, previously the only way to reach an existing project —
 *  it kept its own separate list in localStorage and always knew which id to open) handing in an id.
 *
 *  Scans `VSTUDIO_ROOT` directly rather than keeping a separate index file: the project folders
 *  ARE the source of truth already (see `_lib/paths.ts`), and a directory listing is cheap enough
 *  at the scale a local video editor's project count ever reaches that a second, always-at-risk-of-
 *  drifting index isn't worth maintaining. A folder whose `project.json` fails to parse (corrupted,
 *  or mid-write) is skipped rather than failing the whole list — one bad project shouldn't hide
 *  every other one. */
export const GET = localRoute(async () => {
  if (!fs.existsSync(VSTUDIO_ROOT)) return Response.json({ projects: [] });

  const summaries: ProjectSummary[] = [];
  for (const entry of fs.readdirSync(VSTUDIO_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectFile = path.join(VSTUDIO_ROOT, entry.name, "project.json");
    if (!fs.existsSync(projectFile)) continue;
    try {
      const project = deserializeProject(fs.readFileSync(projectFile, "utf8"));
      summaries.push({
        id: project.bpProjectId,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        clipCount: project.sequence.tracks.reduce((n, t) => n + t.clips.length, 0),
      });
    } catch {
      // Skip — see the function comment above.
    }
  }

  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return Response.json({ projects: summaries });
});
