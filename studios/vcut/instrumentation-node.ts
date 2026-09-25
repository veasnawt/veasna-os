/** Node-only boot work, started once when the server starts (see `instrumentation.ts`, which imports this only
 *  inside a `NEXT_RUNTIME === "nodejs"` check — this file uses `fs` and the Supabase admin client, neither of
 *  which exist in the Edge runtime). Both jobs are hosted-deployment-only and no-op elsewhere. */
import { startExportRetention } from "./app/api/vcut/_lib/exportRetention";
import { startHoldSweeper } from "./app/api/vcut/_lib/jobHolds";

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
