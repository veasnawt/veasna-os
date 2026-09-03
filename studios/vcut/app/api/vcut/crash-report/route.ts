import fs from "fs";
import path from "path";
import { localRoute } from "../_lib/localOnly";
import { VCUT_ROOT } from "../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Web-mode counterpart to `apps/vcut-desktop/src/main.ts`'s own `logCrash` — the browser (whether
 *  the standalone `/` page or BP Studio's `<iframe>` embed of `/edit`) has no filesystem access to
 *  write a log itself, so `packages/vcut/src/api/crashLog.ts`'s `reportError` POSTs here instead
 *  whenever `window.veasnaCrashReporter` (the Electron-only bridge) isn't present. Same JSONL,
 *  same-shaped entry, same rotation cap — the two logs differ only in WHERE they live, not in format,
 *  so a developer reading either doesn't need to learn two conventions. */
const MAX_LOG_ENTRIES = 200;

export const POST = localRoute(async (req) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false }, { status: 400 });
  }

  const entry = { time: new Date().toISOString(), ...body };
  try {
    fs.mkdirSync(VCUT_ROOT, { recursive: true });
    const logPath = path.join(VCUT_ROOT, "crash.log");
    const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean) : [];
    existing.push(JSON.stringify(entry));
    fs.writeFileSync(logPath, existing.slice(-MAX_LOG_ENTRIES).join("\n") + "\n", "utf-8");
  } catch (err) {
    // Best-effort — a failure to PERSIST the crash log must not itself throw back at the client that's
    // already in the middle of handling its own error.
    console.error("[vcut] failed to write crash log:", err);
  }

  return Response.json({ ok: true });
});
