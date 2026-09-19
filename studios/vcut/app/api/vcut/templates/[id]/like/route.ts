import { corsPreflight, hostedOnlyRoute } from "../../../_lib/localOnly";
import { getViewableTemplate } from "../../../_lib/templates";
import { likeTemplate, unlikeTemplate } from "../../../_lib/templateSocial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Like/unlike ONE template as the signed-in caller — real auth required either way (no anonymous
 *  liking, unlike the preview/info routes' own public-friendly reads), but no Pro gate: liking is
 *  browsing-adjacent, the same Free-plan-friendly posture `templates/discover/route.ts` already takes
 *  for using a public template. `getViewableTemplate` is the access check (403s on a private template
 *  you don't own — nothing to like there). */
export const POST = hostedOnlyRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  await getViewableTemplate(id, user.id);
  await likeTemplate(id, user.id);
  return Response.json({ ok: true });
});

export const DELETE = hostedOnlyRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  await unlikeTemplate(id, user.id);
  return Response.json({ ok: true });
});

export const OPTIONS = corsPreflight;
