import { downloadMediaUrl } from "./importMedia";
import { ApiError } from "./paths";

/** Pulls real bytes out of a Replicate prediction's output whatever SHAPE it turns out to be. Shared by
 *  `ai-image/route.ts` and `ai-video/route.ts` because both hit this same uncertainty: this sandbox's
 *  own outbound network is Cloudflare-blocked from reaching replicate.com directly, so neither route's
 *  exact output shape could be confirmed by actually calling it before shipping (see either route's own
 *  credit-cost comment for the fuller story). A first production run of `ai-image` came back with
 *  `ai-image-no-output` — proof the original assumption (always a `FileOutput` object exposing
 *  `.blob()`, mirrored from `inpaint/route.ts`'s own working pattern) doesn't hold for every model even
 *  though it held there, so this tries several real shapes instead of just one:
 *  (1) a `FileOutput`-like object exposing `.blob()` directly — what `inpaint/route.ts` itself sees;
 *  (2) a plain URL string, or one nested under a `url`/`image.url`/`video.url` field — closer to what a
 *  model returning a bare `array of URI` (Flux Schnell's own declared output type) produces when the
 *  SDK doesn't wrap it in a `FileOutput`;
 *  (3) an array of any of the above, taking the first element (every route here only ever requests one
 *  output).
 *  Kept broad on purpose so a schema guess being wrong fails LOUDLY (a clear "no usable output" error)
 *  rather than silently importing something broken — once enough real jobs have run, whichever branch
 *  actually fires should be confirmed and this simplified to just that one. */
export async function extractReplicateMediaBytes(output: unknown, notFoundMessage: string, notFoundCode: string): Promise<Buffer> {
  const candidate = Array.isArray(output) ? output[0] : output;

  if (candidate && typeof (candidate as { blob?: unknown }).blob === "function") {
    const blob = await (candidate as { blob: () => Promise<Blob> }).blob();
    return Buffer.from(await blob.arrayBuffer());
  }

  const asRecord = candidate as { url?: unknown; image?: { url?: unknown }; video?: { url?: unknown } } | string | undefined;
  const url =
    typeof asRecord === "string"
      ? asRecord
      : typeof asRecord?.url === "string"
        ? asRecord.url
        : typeof asRecord?.image?.url === "string"
          ? asRecord.image.url
          : typeof asRecord?.video?.url === "string"
            ? asRecord.video.url
            : undefined;
  if (url) return downloadMediaUrl(url);

  // If every known shape above still misses, log what actually came back — the ONLY way to see the
  // real shape from here, since this sandbox can't call Replicate directly to inspect it up front (see
  // this function's own doc comment). Without this, a second wrong guess would fail exactly as
  // silently on the real cause as the first one did.
  console.error("[vcut] Replicate returned an unrecognized output shape:", JSON.stringify(output)?.slice(0, 2000));
  throw new ApiError(502, notFoundMessage, notFoundCode);
}
