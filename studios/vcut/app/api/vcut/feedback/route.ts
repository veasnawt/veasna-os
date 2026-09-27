import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { validateFeedback } from "@veasnawt/vcut/src/project/feedback";
import { hostedOnlyRoute, corsPreflight } from "../_lib/localOnly";
import { ApiError } from "../_lib/paths";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = hostedOnlyRoute(async (req, user) => {
  let feedback;
  try { feedback = validateFeedback(await req.json()); }
  catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "Invalid feedback."); }
  const db = getSupabaseAdminClient();
  const { count, error: countError } = await db.from("user_feedback").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
  if (countError) throw new ApiError(503, "Feedback is temporarily unavailable. Please try again later.");
  if ((count ?? 0) >= 10) throw new ApiError(429, "You've sent a lot of feedback today. Please try again tomorrow.");
  const { data, error } = await db.from("user_feedback").insert({ user_id: user.id, ...feedback }).select("id").single();
  if (error) throw new ApiError(503, "Couldn't send your feedback. Your message is still here; please retry.");
  return Response.json({ ok: true, id: data.id }, { status: 201 });
});
export const OPTIONS = corsPreflight;
