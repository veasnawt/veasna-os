import { hostedOnlyRoute } from "../../_lib/localOnly";
import { listPublicTemplates } from "../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The "Discover" feed — every OTHER user's published template (`listPublicTemplates`'s own doc
 *  comment covers the exclude-your-own reasoning). Deliberately NOT `requirePro`-gated, unlike every
 *  other route in this file: a Free-plan viewer can browse and start a project from a published
 *  template — only PUBLISHING your own stays Pro-only (`templates/[id]/route.ts`'s own PATCH handler),
 *  a deliberate product decision, not an oversight. Still `hostedOnlyRoute` — genuinely public (no
 *  auth at all) is a bigger, separate decision than this feature has made yet. */
export const GET = hostedOnlyRoute(async (_req, user) => {
  const templates = await listPublicTemplates(user.id);
  return Response.json({ templates });
});
