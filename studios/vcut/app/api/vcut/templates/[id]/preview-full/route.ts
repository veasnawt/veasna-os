import fs from "fs";
import path from "path";
import { publicSessionRoute } from "../../../_lib/localOnly";
import { ApiError, templateAudioPaths } from "../../../_lib/paths";
import { serveFileWithRange } from "../../../_lib/serveFile";
import { getViewableTemplate, requirePro } from "../../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves one template's own FULL-duration, full-quality preview (`renderTemplatePreview`'s own
 *  `preview-full.mp4` — the project's real `exportSettings`, completely unmodified, unlike the short
 *  low-bitrate `preview.mp4` the grid tile's own background loop uses) — what the full-screen swipe
 *  viewer (`TemplateViewer.tsx`) plays. A real, reported gap: that viewer used to point at the exact
 *  same throwaway grid-tile file, so "full screen" was structurally incapable of ever showing more than
 *  a few seconds at reduced quality. Same access-check shape as `preview/route.ts` and `poster/route.ts`
 *  — see the former's own doc comment for the full reasoning. A missing file (an older template saved
 *  before this render existed, or a best-effort render that failed) 404s with its own distinct code —
 *  `TemplateViewer.tsx` falls back to the grid's own `preview.mp4` in that case rather than showing
 *  nothing. */
export const GET = publicSessionRoute(async (req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const template = await getViewableTemplate(id, user?.id ?? "");
  if (user && template.ownerId === user.id) await requirePro(user.id);

  const filePath = path.join(templateAudioPaths(id).dir, "preview-full.mp4");
  if (!fs.existsSync(filePath)) {
    throw new ApiError(404, "This template has no full preview yet", "template-preview-full-missing");
  }

  return serveFileWithRange(req, filePath, "video/mp4", "private, max-age=300, must-revalidate");
});
