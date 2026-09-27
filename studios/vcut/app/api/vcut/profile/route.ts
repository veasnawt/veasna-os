import { hostedOnlyRoute } from "../_lib/localOnly";
import { ApiError } from "../_lib/paths";
import {
  getPublicProfile,
  setProfileIdentity,
  type PublicProfile,
} from "../_lib/profiles";
import {
  prepareProfilePicture,
  removeProfilePicture,
} from "../_lib/profilePicture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(profile: PublicProfile) {
  return Response.json({
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    avatarUrl: profile.avatarPath
      ? `/api/vcut/creators/${profile.id}/avatar?v=${profile.avatarPath}`
      : null,
  });
}

export const GET = hostedOnlyRoute(async (_req, user) =>
  response(await getPublicProfile(user.id)),
);

/** Enforce a real streamed body limit even when Content-Length is missing. */
async function readForm(req: Request): Promise<FormData> {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Invalid profile", "invalid-profile");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 6 * 1024 * 1024) {
        await reader.cancel();
        throw new ApiError(
          413,
          "Choose a picture under 5 MB",
          "invalid-picture",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: Buffer.concat(chunks),
  }).formData();
}

/** Stage any picture first, then commit the entire dialog in one profile upsert. */
export const PATCH = hostedOnlyRoute(async (req, user) => {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 6 * 1024 * 1024)
    throw new ApiError(413, "Choose a picture under 5 MB", "invalid-picture");
  let body: Record<string, unknown>;
  let picture: File | null = null;
  let removePicture = false;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await readForm(req);
    body = {};
    for (const key of ["displayName", "username", "bio"]) {
      if (form.has(key)) body[key] = form.get(key);
    }
    const upload = form.get("picture");
    if (upload !== null && !(upload instanceof File))
      throw new ApiError(400, "Invalid picture", "invalid-picture");
    picture = upload as File | null;
    removePicture = form.get("removePicture") === "true";
    if (picture && removePicture)
      throw new ApiError(400, "Choose or remove a picture", "invalid-picture");
  } else {
    body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ApiError(400, "Invalid profile", "invalid-profile");
  }
  const fields: {
    displayName?: string;
    username?: string;
    bio?: string;
    avatarPath?: string | null;
  } = {};
  for (const key of ["displayName", "username", "bio"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string")
        throw new ApiError(400, `Invalid ${key}`, "invalid-profile");
      fields[key] = body[key];
    }
  }
  if (!Object.keys(fields).length && !picture && !removePicture)
    throw new ApiError(400, "Nothing to update", "missing-fields");
  const previous = await getPublicProfile(user.id);
  const newKey = picture ? await prepareProfilePicture(user.id, picture) : null;
  if (picture || removePicture) fields.avatarPath = newKey;
  try {
    await setProfileIdentity(user.id, fields);
  } catch (err) {
    if (newKey) await removeProfilePicture(user.id, newKey).catch(() => {});
    throw err;
  }
  if ((picture || removePicture) && previous.avatarPath) {
    await removeProfilePicture(user.id, previous.avatarPath).catch(() => {});
  }
  return response(await getPublicProfile(user.id));
});
