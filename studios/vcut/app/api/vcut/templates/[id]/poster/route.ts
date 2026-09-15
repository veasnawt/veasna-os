import fs from "fs";
import path from "path";
import { publicSessionRoute } from "../../../_lib/localOnly";
import { ApiError, templateAudioPaths } from "../../../_lib/paths";
import { serveFileWithRange } from "../../../_lib/serveFile";
import { getViewableTemplate, requirePro } from "../../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves one template's own poster still frame (`renderTemplatePreview`'s own `poster.jpg`, a fast
 *  seek off the already-rendered `preview.mp4` — see that function's own doc comment for why this
 *  exists at all: several browsers, mobile Safari included, never actually decode-and-paint a `<video>`
 *  element's own natural first frame from `preload="metadata"` alone, which left the Templates tab's
 *  grid tile rendering solid black). Same access-check shape as `preview/route.ts` — see that route's
 *  own doc comment for the full reasoning (public-or-owner via `getViewableTemplate`, Pro-gated only
 *  for the owner, `publicSessionRoute` for the public `/t/[id]` share page's own signed-out visitor). A
 *  missing file (an older template saved before poster generation existed, or a best-effort render
 *  that failed) 404s with its own distinct code so the client can fall back cleanly instead of showing
 *  a broken image. */
export const GET = publicSessionRoute(async (req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const template = await getViewableTemplate(id, user?.id ?? "");
  if (user && template.ownerId === user.id) await requirePro(user.id);

  const filePath = path.join(templateAudioPaths(id).dir, "poster.jpg");
  if (!fs.existsSync(filePath)) {
    throw new ApiError(404, "This template has no poster yet", "template-poster-missing");
  }

  return serveFileWithRange(req, filePath, "image/jpeg", "private, max-age=300, must-revalidate");
});
