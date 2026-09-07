/** Next.js's own hook for code that must run once, at server boot, regardless of the AUTO-GENERATED
 *  `server.js` the standalone build produces (`output: "standalone"`, per next.config.ts) — that file
 *  isn't something this repo edits directly, so this is the supported place to install PROCESS-LEVEL
 *  handlers rather than a route/lib file that only ever runs per-request.
 *
 *  Exists specifically to catch what's currently an unexplained, real, repeatedly-reported gap: a live
 *  hosted export gets reported as "Export cancelled" with NO corresponding DELETE request ever
 *  reaching `export/route.ts` (confirmed via that route's own diagnostic log — see its DELETE
 *  handler's comment) and NO memory-pressure signature in Railway's own metrics (confirmed via
 *  `railway metrics --raw` showing flat, low usage through the exact failure window) — meaning the
 *  WHOLE Node process is very likely crashing and being auto-restarted by Railway's own
 *  `restartPolicyType: ON_FAILURE`, silently, before `railway logs` can be checked in time to see why
 *  (that CLI only ever serves the CURRENT container's own log history, not a dead one's final output).
 *  An uncaught exception or unhandled rejection ANYWHERE in the process — including inside FFmpeg's
 *  child-process event handling, Puppeteer's own event loop, or a truly unrelated code path that just
 *  happens to run around the same time as an export — would crash the whole server exactly this way,
 *  with nothing today logging it clearly before Node's own default handler takes over.
 *
 *  `console.error` (not `console.log`) with a distinctive, greppable prefix, and an explicit sync
 *  write to `process.stderr` first — logging providers occasionally lose the last buffered lines of a
 *  dying process, so this maximizes the chance Railway's own log shipper captures it before the
 *  process actually exits. Exits with the SAME effective outcome Node's own default handler would
 *  (process death, Railway restarts it) — this doesn't change what happens, only ensures it's loud and
 *  visible on the way out instead of possibly silent. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  process.on("uncaughtException", (err) => {
    const message = `[vcut] FATAL uncaughtException: ${err?.stack ?? err}\n`;
    process.stderr.write(message);
    console.error("[vcut] FATAL uncaughtException:", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    const message = `[vcut] FATAL unhandledRejection: ${detail}\n`;
    process.stderr.write(message);
    console.error("[vcut] FATAL unhandledRejection:", reason);
    // Deliberately NOT exiting here, unlike uncaughtException — Node's own default for an unhandled
    // rejection with no listener is ALSO to crash (since Node 15), so simply attaching this listener
    // already prevents that default crash. Logging loudly and continuing is strictly more informative
    // than the alternative (crash with no chance to see what caused it) for whatever this turns out to
    // be, and matches how a real bug's fallout should surface: as a broken FEATURE (the export/job that
    // triggered it fails, reported normally), not a broken SERVER taking every other user's in-flight
    // work down with it.
  });
}
