import fs from "fs";
import { ImageResponse } from "next/og";
import { publicSessionRoute } from "../../../_lib/localOnly";
import { ApiError } from "../../../_lib/paths";
import { ensureTemplatePoster, getViewableTemplate, templateAiCredits } from "../../../_lib/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;

/** The picture chat apps and social sites show when a template link is shared (`og:image` on `/t/[id]`): the template's cover on
 *  the left, its name and a call to action on the right, at the 1200x630 size those sites expect for a large card — the bare
 *  540-pixel-wide portrait cover alone showed as a small thumbnail beside the link. Only a public template gets one; a private
 *  or unknown id is a 404, like the page itself. */
export const GET = publicSessionRoute(async (_req, user, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  let template;
  try {
    template = await getViewableTemplate(id, user?.id ?? "");
  } catch {
    throw new ApiError(404, "Template not found", "template-not-found");
  }

  const posterPath = await ensureTemplatePoster(id);
  const poster = posterPath && fs.existsSync(posterPath) ? `data:image/jpeg;base64,${fs.readFileSync(posterPath).toString("base64")}` : null;
  const aspect = template.project.width > 0 && template.project.height > 0 ? template.project.width / template.project.height : 9 / 16;
  const cardHeight = HEIGHT - 80;
  // A landscape template's cover is wide: keep it inside the left half.
  const cardWidth = Math.min(Math.round(cardHeight * aspect), 560);
  const cardShownHeight = Math.round(cardWidth / aspect);
  const usesAi = templateAiCredits(template.project) !== undefined;
  const name = template.name.length > 60 ? `${template.name.slice(0, 57)}…` : template.name;

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          alignItems: "center",
          padding: "0 70px",
          background: "linear-gradient(135deg, #0a0c10 0%, #12151c 55%, #16213a 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            width: cardWidth,
            height: cardShownHeight,
            display: "flex",
            borderRadius: 28,
            overflow: "hidden",
            border: "2px solid rgba(255,255,255,0.18)",
            background: "#000",
            boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
            flexShrink: 0,
          }}
        >
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} width={cardWidth} height={cardShownHeight} style={{ objectFit: "cover" }} alt="" />
          ) : (
            <div style={{ display: "flex", width: "100%", height: "100%", background: "linear-gradient(160deg, #1d4ed8, #7c3aed)" }} />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginLeft: 64, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, color: "#38bdf8", letterSpacing: 1 }}>VCut</div>
          <div style={{ display: "flex", marginTop: 18, fontSize: name.length > 28 ? 58 : 72, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: "rgba(255,255,255,0.7)", lineHeight: 1.3 }}>
            Video template — add your own photos and videos.
          </div>
          <div style={{ display: "flex", marginTop: 38, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                padding: "16px 34px",
                borderRadius: 999,
                fontSize: 30,
                fontWeight: 700,
                background: "linear-gradient(90deg, #38bdf8, #a855f7)",
              }}
            >
              Use this template
            </div>
            {usesAi && (
              <div style={{ display: "flex", marginLeft: 20, padding: "8px 16px", borderRadius: 12, fontSize: 24, fontWeight: 700, background: "#fbbf24", color: "#111" }}>
                PRO · AI effects
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
  );
});
