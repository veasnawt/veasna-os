import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import type { Browser, Page } from "puppeteer";
import type { RenderKhmerTextFrame, RenderKhmerTextParams } from "@veasnawt/vcut/src/export/khmerTextRenderer";

/** Drives the `/vcut/text-harness` page (a headless Chromium instance, via Puppeteer) to render
 *  Khmer-script text clip windows to transparent PNGs — the ONE Node-side thing `khmerTextRenderer.ts`
 *  deliberately doesn't do itself (it stays Puppeteer-free so its own window-computation logic is
 *  unit-testable without a real browser; see its own doc comment). See that module's doc comment for
 *  WHY this exists at all: every FFmpeg-side Khmer text path fails to correctly stack certain
 *  subscript-consonant clusters, confirmed empirically — the browser is the one thing confirmed to
 *  shape it correctly.
 *
 *  One browser + one page instance is opened per EXPORT (not per clip/window) and reused across every
 *  Khmer clip that export needs to render — `openKhmerTextHarness`'s caller (the export route) is
 *  responsible for calling `close()` once, after every clip has been rendered, mirroring the general
 *  shape of the SSE-driven export job it's embedded in. */
export interface KhmerTextHarness {
  renderFrame: RenderKhmerTextFrame;
  close(): Promise<void>;
}

/** @param baseUrl This SAME running server's own origin (e.g. `http://localhost:3002`, derived by the
 *   caller from the incoming export request's own URL rather than a hardcoded port, so this works
 *   whichever port `next dev`/`next start` actually bound) — the harness page it navigates to is part
 *   of this exact app, not a separate service.
 *  @param outDir Where rendered PNGs are written — the same ephemeral `textFilesDir` the export route
 *   already creates and cleans up for `drawtext`'s own text files and a `wordHighlight` clip's `.ass`.
 *  @param customFontUrls Custom-font id → a URL this server can serve font bytes from (built by the
 *   caller from `paths.customFontsDir`, since only Node has filesystem access to it) — threaded
 *   straight through to the harness page's own `registerCustomFont` call. Bundled fonts need no entry
 *   here; their `@font-face` rules already ship in the harness page's own `globals.css`. */
export async function openKhmerTextHarness(baseUrl: string, outDir: string, customFontUrls: Record<string, string>): Promise<KhmerTextHarness> {
  // `--no-sandbox`/`--disable-setuid-sandbox`: Chromium's default sandbox needs kernel privileges
  // most Docker containers don't grant (confirmed: the hosted Docker deployment's first Khmer-text
  // export otherwise fails outright with "No usable sandbox!"). Safe specifically because this
  // browser only ever navigates to ONE page this same app already trusts (`/vcut/text-harness`,
  // below) — it's never pointed at arbitrary or third-party content, which is the actual thing the
  // sandbox protects against. Harmless outside Docker too (dev, desktop) — these flags just relax a
  // protection that was never load-bearing for a same-origin page in the first place.
  //
  // `--disable-dev-shm-usage`: Chromium's default shared-memory usage assumes a real `/dev/shm`,
  // which Docker caps at a tiny 64MB by default regardless of the container's own memory limit —
  // a well-documented, standard Chromium-in-Docker gotcha, not specific to this app. Under real
  // memory pressure (a live hosted export crashed this exact 1GB-limited container, confirmed via
  // Railway's own metrics graph showing a hard spike-then-drop right at the crash), Chromium
  // falling back to `/tmp`-backed memory instead of a too-small `/dev/shm` is the safer failure
  // mode. Harmless outside Docker too, same reasoning as the sandbox flags above.
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  // Everything between launch and the harness signaling ready can throw (a slow first-compile of the
  // `/vcut/text-harness` route under `next dev`, or the whole machine just being busy — a concurrent
  // FFmpeg encode from this SAME export is running the entire time this navigates) — and until now,
  // any of those throwing left `browser` leaked: `openKhmerTextHarness` never returns a `close()` for
  // its caller to call, since it never returns at all. Confirmed directly as a real, compounding
  // bug: a single timed-out launch leaves a whole idle Chromium process running forever, which makes
  // the NEXT export's own launch (if it also has a Khmer clip) that much more likely to ALSO time out
  // on an already-busier machine — a failure mode that gets steadily more likely across a session,
  // not a one-off. Closing `browser` here before rethrowing is what stops that snowball.
  let page: Page;
  try {
    page = await browser.newPage();
    await page.goto(`${baseUrl}/vcut/text-harness`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (window as unknown as { __harnessReady?: boolean }).__harnessReady === true, { timeout: 30_000 });
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }

  let viewportSized = false;
  let counter = 0;

  const renderFrame: RenderKhmerTextFrame = async (params: RenderKhmerTextParams) => {
    // Sized once, from the FIRST call — every window within one export shares the same
    // frameWidth/frameHeight (the project's own sequence resolution), so re-sizing per call would be
    // pure overhead. `deviceScaleFactor: 1` is what makes the canvas element's own CSS size (and so
    // Puppeteer's own element screenshot) land on exactly `frameWidth`×`frameHeight` REAL pixels, not
    // some device-pixel-ratio-scaled multiple of it.
    if (!viewportSized) {
      await page.setViewport({ width: params.frameWidth, height: params.frameHeight, deviceScaleFactor: 1 });
      viewportSized = true;
    }

    await page.evaluate(
      (p) => (window as unknown as { __renderTextFrame: (p: unknown) => Promise<void> }).__renderTextFrame(p),
      { ...params, customFontUrls }
    );

    const canvas = await page.$("canvas");
    if (!canvas) throw new Error("Khmer text render harness: canvas element missing");
    const outPath = path.join(outDir, `khmer-${counter++}.png`);
    await canvas.screenshot({ path: outPath as `${string}.png`, omitBackground: true });
    return outPath;
  };

  return {
    renderFrame,
    close: () => browser.close(),
  };
}

/** Builds `customFontUrls` for `openKhmerTextHarness` — reads each of the project's own custom font
 *  files directly off disk (this server already has them, no need to round-trip through its own HTTP
 *  API) and base64-encodes them as `data:` URIs, which `registerCustomFont`'s `FontFace` constructor
 *  can consume exactly like a real network URL. Skips a font whose file is missing/unreadable rather
 *  than throwing — the same "best effort, never crash the whole export over one missing resource"
 *  spirit `ExportPlanOptions.fontMetricsFor`'s own doc comment already documents. */
export function buildCustomFontDataUrls(customFontsDir: string, customFonts: { id: string; relPath: string }[]): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const font of customFonts) {
    try {
      const bytes = fs.readFileSync(path.join(customFontsDir, font.relPath));
      urls[font.id] = `data:font/ttf;base64,${bytes.toString("base64")}`;
    } catch {
      // Unreadable/missing file — this font just won't register in the harness; the clip falls back
      // to whatever `resolveFont`'s own bundled-default degradation already does elsewhere.
    }
  }
  return urls;
}
