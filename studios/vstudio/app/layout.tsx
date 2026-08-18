import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VStudio",
  description: "A focused video editor for short-form creative work.",
};

// Explicit rather than relying on Next's own default: VStudio's responsive layout (see
// VStudioApp.tsx) assumes the browser reports the device's real width, not a desktop-sized virtual
// viewport scaled down — the usual mobile-web default for pages that were never designed responsively.
//
// `userScalable: false` + `maximumScale: 1`: without this, a real touchscreen's native "pinch to zoom
// the whole page" gesture competes with the Timeline's own JS-driven pinch-to-zoom (Timeline.tsx) —
// confirmed as the actual cause of "pinch to zoom doesn't work" on a real device (a CDP-simulated
// pinch worked fine, since that bypasses the browser's own native gesture recognizer entirely; only a
// real touchscreen actually engages it). Standard tradeoff for an app implementing its own pinch
// gesture on a specific surface (most editors/canvas apps do this) — the cost is that a user who
// relies on OS pinch-zoom for low vision loses that on this page specifically, not app-wide.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: false,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0a0c10] text-white">{children}</body>
    </html>
  );
}
