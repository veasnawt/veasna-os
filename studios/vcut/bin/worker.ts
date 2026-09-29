#!/usr/bin/env node
/** Standalone Export Worker Process for VCut.
 *
 *  Can be run as an independent background container/service on Railway or Fly.io:
 *  `node --experimental-strip-types bin/worker.ts` or `pnpm worker`
 *
 *  Claims jobs from `vcut_export_jobs` via PostgreSQL `FOR UPDATE SKIP LOCKED`.
 *  Controlled via environment variables:
 *  - VCUT_WORKER_CONCURRENCY: max concurrent renders (default 1)
 *  - VCUT_WORKER_POLL_MS: queue polling interval in ms (default 2000)
 *  - VCUT_WEB_URL: URL to reach Next.js text harness (default http://127.0.0.1:3000)
 */

import { ExportWorker } from "../app/api/vcut/_lib/exportWorker.ts";

const concurrency = Math.max(1, Number(process.env.VCUT_WORKER_CONCURRENCY) || 1);
const worker = new ExportWorker({ concurrency });

console.log(`[vcut-worker] Starting standalone export worker (concurrency=${concurrency})...`);

const shutdown = (signal: string) => {
  console.log(`[vcut-worker] Received ${signal}, shutting down gracefully...`);
  worker.stop();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

worker.start().catch((err) => {
  console.error("[vcut-worker] Fatal error in worker loop:", err);
  process.exit(1);
});
