import fs from "fs";
import { publicSessionRoute } from "../../../../_lib/localOnly";
import { ApiError, resolveWithin, templateAudioPaths } from "../../../../_lib/paths";
import { getViewableTemplate } from "../../../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Streams the real bytes behind ONE `Asset.templateBundledAudio` entry of a template — the missing
 *  piece for using a template on a platform with no server of its own (native mobile): every other
 *  copy of this file happens filesystem-to-filesystem, server-side (`bundleTemplateAudio` writing it in,
 *  `resolveTemplateBundledAudio` copying it into a new owner's library), because until now nothing ever
 *  needed to hand these bytes to a REMOTE caller. `client.ts`'s native `createProjectFromTemplate`
 *  branch is that first caller — it has no local filesystem copy of `templateAudioPaths(id)` to read
 *  from directly, only this route.
 *
 *  Same visibility rule as `preview`/`poster` (`getViewableTemplate` — owner, or anyone once it's
 *  public), NOT Pro-gated (matching `discover/route.ts`'s own "Free can browse/use a published
 *  template" decision — this route only ever serves a template someone is already using, the same
 *  entitlement `project/route.ts`'s own create-from-template flow already grants).
 *
 *  `[file]` is checked against the template's own real asset list rather than trusted as a raw path —
 *  same "known set, not a filesystem path" discipline `sfx/[file]/route.ts` already uses — so a request
 *  can't be used to probe or read anything outside what this template actually bundles. */
export const GET = publicSessionRoute(async (_req, user, context: { params: Promise<{ id: string; file: string }> }) => {
  const { id, file } = await context.params;
  const template = await getViewableTemplate(id, user?.id ?? "");
  const known = template.project.assets.some((a) => a.templateBundledAudio && a.relPath === file);
  if (!known) throw new ApiError(404, "Unknown template audio file", "template-audio-not-found");

  const filePath = resolveWithin(templateAudioPaths(id).mediaDir, file);
  if (!fs.existsSync(filePath)) throw new ApiError(404, "Unknown template audio file", "template-audio-not-found");
  const stat = fs.statSync(filePath);

  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  const contentType =
    { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac" }[ext] ??
    "application/octet-stream";

  return new Response(new Uint8Array(fs.readFileSync(filePath)), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      // A template's bundled audio never changes once saved (`bundleTemplateAudio` writes it once, at
      // template-save time) — safe to cache aggressively, same reasoning `sfx/[file]/route.ts`'s
      // identical header already gives for its own bundled, immutable files.
      "Cache-Control": "public, max-age=31536000, immutable",
      // Native's own `fetch().blob()` download (see this route's own top doc comment) needs this the
      // same way `sfx/[file]/route.ts` already does — a plain cross-origin `fetch()` reading a response
      // body is blocked without it. Safe unconditionally: bearer-token-gated by `getViewableTemplate`
      // above, not by cookie, so a permissive origin leaks nothing a differently-configured CORS policy
      // would have protected (same reasoning `withCors`'s own doc comment gives for billing).
      "Access-Control-Allow-Origin": "*",
    },
  });
});
