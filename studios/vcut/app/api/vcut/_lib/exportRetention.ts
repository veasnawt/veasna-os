import fs from "fs";
import path from "path";
import { VCUT_HOSTED } from "./auth";
import { VCUT_ROOT } from "./paths";
import { selectExpiredExports, type ExportFileInfo } from "./exportRetentionRules";

/** How long a finished export stays on the hosted server. Long enough to download it (the editor hands the
 *  file over as soon as the export finishes) and to come back the next day for a re-download; short enough
 *  that the volume doesn't grow without bound — exports used to be kept forever and never counted toward
 *  anyone's storage quota. Local installs keep everything: it's the user's own disk. */
export const EXPORT_RETENTION_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Every file in every project's `exports/` folder under `VCUT_ROOT`. Only that one directory level of each
 *  project is read — nothing else under `VCUT_ROOT` is ever touched. */
function listExportFiles(): ExportFileInfo[] {
  const files: ExportFileInfo[] = [];
  let projectDirs: fs.Dirent[];
  try {
    projectDirs = fs.readdirSync(VCUT_ROOT, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const project of projectDirs) {
    if (!project.isDirectory()) continue;
    const exportsDir = path.join(VCUT_ROOT, project.name, "exports");
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(exportsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(exportsDir, entry.name);
      try {
        files.push({ path: filePath, modifiedMs: fs.statSync(filePath).mtimeMs });
      } catch {
        // Vanished between the listing and the stat — nothing to do.
      }
    }
  }
  return files;
}

/** Deletes hosted exports older than `EXPORT_RETENTION_MS`. `activePaths` are output files that must never be
 *  removed regardless of age. (A job still writing a file keeps its modified time fresh, and no export runs
 *  for a day, so nothing in practice needs listing — the hook exists for callers that want a hard guarantee.)
 *  Returns how many files were deleted. */
export function pruneExpiredExports(activePaths: ReadonlySet<string> = new Set(), nowMs = Date.now()): number {
  const expired = selectExpiredExports(listExportFiles(), nowMs, EXPORT_RETENTION_MS, activePaths);
  let deleted = 0;
  for (const file of expired) {
    try {
      fs.rmSync(file.path, { force: true });
      deleted++;
    } catch (err) {
      console.error("[vcut] export retention: could not delete", file.path, err);
    }
  }
  if (deleted > 0) console.log(`[vcut] export retention: deleted ${deleted} export(s) older than ${EXPORT_RETENTION_MS / 3_600_000}h`);
  return deleted;
}

let started = false;
/** Starts the hourly retention sweep (hosted deployment only). Idempotent; called from `instrumentation.ts`. */
export function startExportRetention(activeExportPaths: () => ReadonlySet<string> = () => new Set()): void {
  if (started || !VCUT_HOSTED) return;
  started = true;
  const run = () => {
    try {
      pruneExpiredExports(activeExportPaths());
    } catch (err) {
      console.error("[vcut] export retention sweep failed:", err);
    }
  };
  setInterval(run, SWEEP_INTERVAL_MS).unref?.();
  setTimeout(run, 60_000).unref?.();
}
