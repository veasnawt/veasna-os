import fs from "fs";
import { sfxAssetPath } from "../../../_lib/sfx";
import { publicAssetRoute } from "../../../_lib/localOnly";
import { ApiError } from "../../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves a music track file directly to the browser. */
export const GET = publicAssetRoute(async (_req, context: { params: Promise<{ file: string }> }) => {
  const { file } = await context.params;
  if (!file || file.includes("..") || file.includes("/")) {
    throw new ApiError(400, "Invalid file parameter", "invalid-file");
  }

  let filePath: string;
  try {
    filePath = sfxAssetPath(file);
  } catch {
    throw new ApiError(404, "Music file not found", "music-not-found");
  }

  const stat = fs.statSync(filePath);

  return new Response(new Uint8Array(fs.readFileSync(filePath)), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

