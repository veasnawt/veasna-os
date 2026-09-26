import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getViewableTemplate } from "../../api/vcut/_lib/templates";
import { templateAudioPaths } from "../../api/vcut/_lib/paths";

/** What a shared template link looks like when it is pasted into a chat or a post: a large card with the template's cover, its
 *  name and a short line, and the preview video for sites that can play it. `page.tsx` is a client component (it can't export
 *  metadata), so this layout provides it. A private or unknown template gets the plain site title instead of leaking anything. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "vcut.io";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  let template: Awaited<ReturnType<typeof getViewableTemplate>>;
  try {
    template = await getViewableTemplate(id, "");
  } catch {
    return { title: "VCut template" };
  }

  const title = `${template.name} — VCut template`;
  const description = "Make this video in VCut: pick your own photos and videos and the template does the editing.";
  const image = `${origin}/api/vcut/templates/${encodeURIComponent(id)}/share-image`;
  // The FULL-length, real-quality render (`preview-full.mp4`) makes a much better "big preview" than the 6-second, low-bitrate
  // tile loop — chat apps that support `og:video` (Discord, Telegram, WhatsApp, Slack, iMessage) play it inline right in the
  // link card, no click-through needed. Falls back to the tile loop for a template saved before that file existed, or whose
  // background render hasn't finished yet (checked directly on disk — the fast, no-network way to know from inside this app).
  const hasFullPreview = fs.existsSync(path.join(templateAudioPaths(id).dir, "preview-full.mp4"));
  const video = `${origin}/api/vcut/templates/${encodeURIComponent(id)}/${hasFullPreview ? "preview-full" : "preview"}`;
  const width = template.project.width > 0 ? template.project.width : 1080;
  const height = template.project.height > 0 ? template.project.height : 1920;
  // `preview-full` is capped at 960px on its long side (see `TEMPLATE_FULL_PREVIEW_MAX_DIMENSION`); the tile loop at 540px.
  const scale = Math.min(1, (hasFullPreview ? 960 : 540) / Math.max(width, height));

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      type: "video.other",
      siteName: "VCut",
      title,
      description,
      url: `${origin}/t/${encodeURIComponent(id)}`,
      images: [{ url: image, width: 1200, height: 630, alt: template.name }],
      videos: [{ url: video, secureUrl: video, type: "video/mp4", width: Math.round(width * scale), height: Math.round(height * scale) }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function TemplateShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
