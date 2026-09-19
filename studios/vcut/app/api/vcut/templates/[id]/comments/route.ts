import { newId } from "@veasnawt/vcut/src/project/createProject";
import { corsPreflight, hostedOnlyRoute, publicSessionRoute, withCors } from "../../../_lib/localOnly";
import { ApiError } from "../../../_lib/paths";
import { getViewableTemplate } from "../../../_lib/templates";
import { addComment, listComments } from "../../../_lib/templateSocial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List a public template's own comments — genuinely optional auth (`publicSessionRoute`), same
 *  reasoning as `templates/[id]/preview/route.ts`: Phase 3's public `/t/[id]` share page reads this
 *  with no session at all, and the in-app Discover/viewer comments panel reads the SAME route as a
 *  signed-in user. */
const getComments = publicSessionRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  await getViewableTemplate(id, user?.id ?? "");
  const comments = await listComments(id);
  return Response.json({ comments });
});

// `publicSessionRoute` adds no CORS handling of its own — see `templates/[id]/route.ts`'s identical
// GET wrapper for the full "why" this needs it explicitly.
export const GET = async (req: Request, context: { params: Promise<{ id: string }> }) => withCors(await getComments(req, context));

/** `{ body: string }` — posting a comment requires a real session (no anonymous comments, unlike
 *  reading them) and the template must still be one this user can see (`getViewableTemplate`: public,
 *  or their own). */
export const POST = hostedOnlyRoute(async (req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  await getViewableTemplate(id, user.id);
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  if (typeof body.body !== "string") throw new ApiError(400, "Missing body", "missing-comment-body");
  const comment = await addComment(newId("cmt"), id, user.id, body.body);
  return Response.json({ comment });
});

export const OPTIONS = corsPreflight;
