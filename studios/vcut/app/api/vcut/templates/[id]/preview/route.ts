import fs from "fs";
import path from "path";
import { publicSessionRoute } from "../../../_lib/localOnly";
import { ApiError, templateAudioPaths } from "../../../_lib/paths";
import { serveFileWithRange } from "../../../_lib/serveFile";
import { getViewableTemplate, requirePro } from "../../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves one template's own preview clip (`renderTemplatePreview`'s output, `templates/<id>/preview.mp4`
 *  under `templateAudioPaths(id).dir` — a fixed filename, sibling of that same helper's own `media`/
 *  `thumbnails` subdirectories) — the Templates tab's grid poster frame and full-screen autoplay video.
 *
 *  `getViewableTemplate` doubles as the access check here (most of its return value is discarded —
 *  this route only needs the 403-if-neither-yours-nor-public side effect, not the template's own
 *  structural data) — allows a PUBLIC template's preview through for any signed-in viewer (Phase 2's
 *  opt-in sharing), Pro-gated only when the viewer is the template's own OWNER (browsing/using a
 *  template someone ELSE published is Free-plan-friendly by design — see that column's own migration
 *  comment). Private/short-cached (`private, max-age=300`), unlike the bundled SFX catalog's own
 *  `public, immutable` — a template's preview is real user content that could eventually be deleted or
 *  re-rendered, not a permanent bundled app asset. A missing file (an older template saved before
 *  preview rendering existed, or a best-effort render that failed — see `renderTemplatePreview`'s own
 *  doc comment) 404s with a distinct code so the client can show a generic placeholder tile instead of
 *  a broken video, same "Media Offline" pattern `media/raw/route.ts` already establishes for a missing
 *  project file.
 *
 *  `publicSessionRoute` (genuinely optional auth, see its own doc comment), not `hostedOnlyRoute` —
 *  Phase 3's public `/t/[id]` share page needs this same video reachable by a signed-out visitor when
 *  the template is public (its own scoping decision: "a public preview page, no sign-in required"). An
 *  anonymous request passes `""` as the viewer id to `getViewableTemplate`, which can never match a
 *  real `owner_id`, so it naturally degrades to exactly "must be public" — the same check a signed-in
 *  non-owner already gets. */
export const GET = publicSessionRoute(async (req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const template = await getViewableTemplate(id, user?.id ?? "");
  if (user && template.ownerId === user.id) await requirePro(user.id);

  const filePath = path.join(templateAudioPaths(id).dir, "preview.mp4");
  if (!fs.existsSync(filePath)) {
    throw new ApiError(404, "This template has no preview yet", "template-preview-missing");
  }

  return serveFileWithRange(req, filePath, "video/mp4", "private, max-age=300, must-revalidate");
});
