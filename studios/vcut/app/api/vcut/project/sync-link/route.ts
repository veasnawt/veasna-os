import fs from "fs/promises";
import path from "path";
import { VCUT_HOSTED } from "../../_lib/auth";
import { localRoute } from "../../_lib/localOnly";
import { ApiError, VCUT_ROOT, projectPaths } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function localOnly() { if (VCUT_HOSTED) throw new ApiError(404, "Device settings only"); }
export const GET = localRoute(async (req) => {
  localOnly();
  const id = new URL(req.url).searchParams.get("projectId");
  if (id) {
    const data = await fs.readFile(path.join(projectPaths(id).dir, "sync-link.json"), "utf8").catch(() => "null");
    return Response.json({ link: JSON.parse(data) });
  }
  const links: Record<string, unknown> = {};
  for (const entry of await fs.readdir(VCUT_ROOT, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9_-]+$/.test(entry.name) || entry.name === "users") continue;
    try { links[entry.name] = JSON.parse(await fs.readFile(path.join(projectPaths(entry.name).dir, "sync-link.json"), "utf8")); } catch {}
  }
  return Response.json({ links });
});
export const PUT = localRoute(async (req) => {
  localOnly();
  const id = new URL(req.url).searchParams.get("projectId");
  if (!id) throw new ApiError(400, "Missing projectId");
  const paths = projectPaths(id);
  await fs.access(paths.projectFile);
  const { link } = await req.json();
  const file = path.join(paths.dir, "sync-link.json");
  await fs.writeFile(`${file}.tmp`, JSON.stringify(link));
  await fs.rename(`${file}.tmp`, file);
  return Response.json({ ok: true });
});
