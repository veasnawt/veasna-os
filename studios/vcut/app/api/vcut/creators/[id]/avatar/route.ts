import fs from "fs/promises";
import { publicSessionRoute } from "../../../_lib/localOnly";
import { ApiError } from "../../../_lib/paths";
import {
  getPublicProfile,
  resolveProfileIdFromUrlSegment,
} from "../../../_lib/profiles";
import { profilePicturePath } from "../../../_lib/profilePicture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicSessionRoute(
  async (_req, _user, context: { params: Promise<{ id: string }> }) => {
    const id = await resolveProfileIdFromUrlSegment((await context.params).id);
    if (!id) throw new ApiError(404, "No picture", "picture-not-found");
    const profile = await getPublicProfile(id);
    if (!profile.avatarPath)
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    try {
      const bytes = await fs.readFile(
        profilePicturePath(id, profile.avatarPath),
      );
      return new Response(bytes, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT")
        return new Response(null, {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      throw err;
    }
  },
);
