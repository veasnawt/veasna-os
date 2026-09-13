import { VCUT_HOSTED } from "../../_lib/auth";
import { hostedSessionRoute } from "../../_lib/localOnly";
import { ApiError, ensureUserMediaDirs } from "../../_lib/paths";
import { getProfile } from "../../_lib/profiles";
import { deleteUserMedia, findProjectsUsingMedia, getStorageUsageBytes, listUserMedia, STORAGE_CAP_BYTES } from "../../_lib/userMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/vcut/media/library` — the current user's own account-wide media (every import, AI
 *  generation, and stock download across every project of theirs — see `Asset.libraryMediaId`'s own
 *  doc comment), plus their current storage usage against their plan's own cap, so the UI can show
 *  "3.2GB of 10GB used" without a second round trip. Hosted-only: there's no "account" for this to
 *  belong to in local/desktop mode, where every asset stays project-local exactly as before this
 *  existed. */
export const GET = hostedSessionRoute(async (_req, user) => {
  if (!VCUT_HOSTED || !user) throw new ApiError(400, "Your media library is only available on vcut.io", "library-unavailable");
  const [items, usedBytes, profile] = await Promise.all([listUserMedia(user.id), getStorageUsageBytes(user.id), getProfile(user.id)]);
  return Response.json({ items, usedBytes, capBytes: STORAGE_CAP_BYTES[profile?.plan ?? "free"] });
});

/** `DELETE /api/vcut/media/library?id=...` — permanently removes one library item and its files.
 *
 *  Since a library item can be shared across every project that placed it (see `Asset.libraryMediaId`'s
 *  own doc comment — one real file, referenced rather than copied), deleting it out from under a
 *  project still using it would leave that project's own clip pointing at nothing. So this checks
 *  `findProjectsUsingMedia` FIRST: if anything still references it, this returns 409 with the list
 *  instead of deleting, and only proceeds once the caller passes `force=1` — the client's own confirm-
 *  after-warning step, not a second identical scan repeated here. */
export const DELETE = hostedSessionRoute(async (req, user) => {
  if (!VCUT_HOSTED || !user) throw new ApiError(400, "Your media library is only available on vcut.io", "library-unavailable");
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ApiError(400, "Missing id", "missing-id");
  const force = url.searchParams.get("force") === "1";

  if (!force) {
    const usedBy = await findProjectsUsingMedia(user.id, id);
    if (usedBy.length > 0) return Response.json({ inUse: true, projects: usedBy }, { status: 409 });
  }

  const paths = ensureUserMediaDirs(user.id);
  await deleteUserMedia(id, user.id, paths.mediaDir, paths.thumbnailsDir);
  return Response.json({ ok: true });
});
