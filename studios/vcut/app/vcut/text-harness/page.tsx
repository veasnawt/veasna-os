"use client";

import { useEffect, useRef } from "react";
import { drawAnimatedTextFrame } from "@veasnawt/vcut/src/playback/textLayout";
import { registerCustomFont, resolveFont } from "@veasnawt/vcut/src/project/fonts";
import type { Clip, CustomFontAsset, TextStyle } from "@veasnawt/vcut/src/project/types";
import type { WordTiming } from "@veasnawt/vcut/src/timeline/textAnimation";

/** Not a real page anyone visits — a render target for `_lib/khmerTextHarness.ts`'s headless Chromium
 *  instance, which navigates here once per export and calls `window.__renderTextFrame` repeatedly
 *  (once per Khmer-script text clip window — see `khmerTextRenderer.ts`'s own doc comment for why
 *  Khmer text renders through a real browser instead of FFmpeg at all: every FFmpeg-side text path
 *  fails to correctly stack certain subscript-consonant clusters, confirmed empirically, and the
 *  browser is the one thing confirmed to shape it correctly). Screenshots the canvas element itself
 *  right after each call (with a transparent background) to produce one PNG per window.
 *
 *  Draws through `drawAnimatedTextFrame` — the exact same function `PlaybackEngine`'s live canvas
 *  preview calls (extracted out of it for exactly this reuse) — so a window this page renders is
 *  guaranteed pixel-identical to what the preview shows at that same elapsed time, not a
 *  reimplementation that could quietly drift from it. This page's own `<head>` inherits `globals.css`'s
 *  bundled `@font-face` rules for free (same Next.js app, same build), so `document.fonts.load(...)`
 *  below can trigger the exact same fetches the live editor's own font picker does. */
interface RenderFrameParams {
  frameWidth: number;
  frameHeight: number;
  content: string;
  style: TextStyle;
  animation: Clip["textAnimation"];
  elapsedSeconds: number;
  clipDurationSeconds: number;
  customFonts: CustomFontAsset[];
  /** Mirrors `khmerTextRenderer.ts`'s `RenderKhmerTextParams.wordTimings` exactly (a separate copy,
   *  same cross-app-boundary reasoning this whole interface already follows) — passed straight through
   *  to `drawAnimatedTextFrame` below. */
  wordTimings?: WordTiming[];
  /** Custom-font id → a URL (or `data:` URI) `registerCustomFont` can fetch — bundled fonts need none
   *  of this (their `@font-face` rules are already in `globals.css`), but a custom (project-uploaded)
   *  font has no static CSS rule anywhere, the same reason `registerCustomFont` itself exists (see its
   *  own doc comment in `project/fonts.ts`). Built by the Node-side glue (`_lib/khmerTextHarness.ts`),
   *  which has filesystem access to the project's own custom-fonts directory this page doesn't. */
  customFontUrls: Record<string, string>;
}

declare global {
  interface Window {
    __renderTextFrame?: (params: RenderFrameParams) => Promise<void>;
    __harnessReady?: boolean;
  }
}

// Which custom font ids this page has already registered a `FontFace` for — module-scope so a second
// window's render call for the SAME custom font (extremely common: every window of one animated clip
// shares one `style.fontFamily`) doesn't redundantly re-fetch/re-register it, mirroring `fonts.ts`'s
// own `customFontRegistrations` memoization for the same reason.
const registeredCustomFontIds = new Set<string>();

export default function TextHarnessPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The root layout gives every route's `<body>` an explicit opaque `bg-[#0a0c10]` (VCut's dark
  // theme) — fine for every real page, but fatal here: `canvas.screenshot({omitBackground: true})`
  // below only suppresses Chromium's own IMPLICIT default white background, it can't override an
  // EXPLICITLY set CSS one. With the canvas's own CSS background left at its (transparent) default,
  // Puppeteer ends up rasterizing the canvas's real per-pixel alpha=0 areas against whatever's behind
  // them in the page — this body color — flattening the whole screenshot to an opaque, alpha-less
  // PNG. Confirmed directly: the captured window PNGs decoded as `rgb24` (no alpha plane at all), and
  // every exported Khmer clip showed solid `#0a0c10`-ish black instead of the video underneath for
  // exactly the clip's own on-screen duration, recovering the instant it ended. Overriding back to
  // transparent for just this one route (restored on unmount, though nothing else ever mounts here)
  // is what makes "genuinely nothing behind the canvas" true again, so the real per-pixel alpha this
  // page already draws correctly reaches the output PNG unflattened.
  useEffect(() => {
    const { body, documentElement: html } = document;
    const prevBodyBg = body.style.background;
    const prevHtmlBg = html.style.background;
    body.style.background = "transparent";
    html.style.background = "transparent";
    return () => {
      body.style.background = prevBodyBg;
      html.style.background = prevHtmlBg;
    };
  }, []);

  useEffect(() => {
    window.__renderTextFrame = async (params) => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("text harness canvas not mounted");
      canvas.width = params.frameWidth;
      canvas.height = params.frameHeight;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("text harness could not get a 2d context");
      context.clearRect(0, 0, params.frameWidth, params.frameHeight);

      const font = resolveFont(params.style.fontFamily, params.customFonts);
      const isCustom = params.customFonts.some((f) => f.id === params.style.fontFamily);
      if (isCustom && !registeredCustomFontIds.has(params.style.fontFamily)) {
        const url = params.customFontUrls[params.style.fontFamily];
        if (url) {
          await registerCustomFont(font.cssFamily, url, params.style.fontFamily);
          registeredCustomFontIds.add(params.style.fontFamily);
        }
      }
      // Waits for the SPECIFIC face this call needs, rather than firing every bundled font's own load
      // and hoping it settles in time (`preloadFont`'s own fire-and-forget shape, built for a live UI
      // that keeps redrawing every frame regardless — this harness draws exactly once per call and
      // must have the real glyphs ready before that single draw, not a few frames later). A custom
      // font's `FontFace` was just registered directly above, so this resolves immediately for it.
      const weight = params.style.bold ? 700 : 400;
      await document.fonts.load(`${weight} ${params.style.fontSize}px "${font.cssFamily}"`);

      drawAnimatedTextFrame(
        context,
        params.frameWidth,
        params.frameHeight,
        params.content,
        params.style,
        params.animation,
        params.elapsedSeconds,
        params.clipDurationSeconds,
        params.customFonts,
        params.wordTimings
      );
    };
    window.__harnessReady = true;
    return () => {
      window.__renderTextFrame = undefined;
      window.__harnessReady = false;
    };
  }, []);

  return <canvas ref={canvasRef} />;
}
