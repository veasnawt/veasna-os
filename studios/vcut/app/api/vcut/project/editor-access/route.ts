import { corsPreflight, localRoute } from "../../_lib/localOnly";
import { ApiError, assertValidProjectId } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The generic hosted project gate is owner-only for this route. Reviewers can
 * read project JSON for playback, but must never enter the editor UI. */
export const GET = localRoute(async (req) => {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "Missing projectId", "missing-project-id");
  assertValidProjectId(projectId);
  return Response.json({ canEdit: true }, { headers: { "Cache-Control": "private, no-store" } });
});

export const OPTIONS = corsPreflight;
