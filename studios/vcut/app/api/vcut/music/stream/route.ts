import { corsPreflight, hostedSessionRouteCors } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxies external audio streams through 'self' so audio preview never trips
 *  Content-Security-Policy or cross-origin restrictions. */
export const GET = hostedSessionRouteCors(async (req) => {
  const urlParam = new URL(req.url).searchParams.get("url");
  if (!urlParam) throw new ApiError(400, "Missing url", "missing-url");

  const audioRes = await fetch(urlParam);
  if (!audioRes.ok) {
    throw new ApiError(502, "Failed to stream audio track", "audio-fetch-failed");
  }

  return new Response(audioRes.body, {
    headers: {
      "Content-Type": audioRes.headers.get("Content-Type") || "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

export const OPTIONS = corsPreflight;

