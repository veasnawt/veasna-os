import type { Metadata } from "next";
import { headers } from "next/headers";
import { getViewableTemplate } from "../../api/vcut/_lib/templates";

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
  const video = `${origin}/api/vcut/templates/${encodeURIComponent(id)}/preview`;
  const width = template.project.width > 0 ? template.project.width : 1080;
  const height = template.project.height > 0 ? template.project.height : 1920;
  const scale = Math.min(1, 540 / Math.max(width, height));

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
