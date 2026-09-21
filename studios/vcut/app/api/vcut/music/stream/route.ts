import fs from "fs";
import path from "path";
import { corsPreflight, publicSessionRouteCors } from "../../_lib/localOnly";
import { sfxAssetPath } from "../../_lib/sfx";
import { ApiError } from "../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxies external audio streams or serves local music/sfx files through 'self' so audio preview never trips
 *  Content-Security-Policy or cross-origin restrictions. */
export const GET = publicSessionRouteCors(async (req) => {
  const urlParam = new URL(req.url).searchParams.get("url");
  if (!urlParam) throw new ApiError(400, "Missing url", "missing-url");

  // Check if it's a bundled sfx / music file by filename or /file/
  if (urlParam.startsWith("/api/vcut/sfx/") || urlParam.startsWith("/api/vcut/music/file/") || !urlParam.startsWith("http")) {
    const fileName = path.basename(urlParam.split("?")[0]);
    try {
      const filePath = sfxAssetPath(fileName);
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
    } catch {
      // Fallback to fetch if not found as local sfx
    }
  }

  const targetUrl = urlParam.startsWith("/") ? new URL(urlParam, req.url).toString() : urlParam;
  const audioRes = await fetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });
  if (!audioRes.ok) {
    throw new ApiError(502, "Failed to stream audio track", "audio-fetch-failed");
  }

  return new Response(audioRes.body, {
    headers: {
      "Content-Type": audioRes.headers.get("Content-Type") || "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

export const OPTIONS = corsPreflight;
