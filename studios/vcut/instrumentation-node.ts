/** Node-only boot work, started once when the server starts (see `instrumentation.ts`, which imports this only
 *  inside a `NEXT_RUNTIME === "nodejs"` check — this file uses `fs` and the Supabase admin client, neither of
 *  which exist in the Edge runtime). Hosted-deployment-only and no-op elsewhere. */
import { startExportRetention } from "./app/api/vcut/_lib/exportRetention";
import { startHoldSweeper } from "./app/api/vcut/_lib/jobHolds";
import { ExportWorker } from "./app/api/vcut/_lib/exportWorker";
import { isDurableQueueActive } from "./app/api/vcut/_lib/exportQueue";

// Refund credits for jobs a previous container died in the middle of (deploy / crash) — see
// `app/api/vcut/_lib/jobHoldsService.ts`.
try {
  startHoldSweeper();
} catch (err) {
  console.error("[vcut] could not start the job-hold sweeper:", err);
}

// Delete finished exports after 24h so the volume doesn't grow forever — see `exportRetention.ts`.
try {
  startExportRetention();
} catch (err) {
  console.error("[vcut] could not start export retention:", err);
}

// Optional embedded background export worker: runs inside the single web container so queued exports
// process without needing a second paid service instance during early rollout.
if (process.env.VCUT_WORKER_EMBEDDED === "true" && isDurableQueueActive()) {
  try {
    const embeddedWorker = new ExportWorker();
    void embeddedWorker.start();
    console.log("[vcut] Embedded export worker loop started in web process.");
  } catch (err) {
    console.error("[vcut] could not start embedded export worker:", err);
  }
}
