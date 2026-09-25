/** The pure half of export retention (which files are due for deletion), kept free of the filesystem so it can
 *  be unit-tested. */

export interface ExportFileInfo {
  path: string;
  /** Last-modified time, ms since the epoch. */
  modifiedMs: number;
}

/** Files older than `maxAgeMs` — except any in `activePaths` (an export still being written, or one just
 *  finished and about to be downloaded), which are never eligible however old their timestamp looks. A file
 *  with a nonsensical (NaN / future) timestamp is kept: deleting on bad data is the wrong failure direction. */
export function selectExpiredExports(files: ExportFileInfo[], nowMs: number, maxAgeMs: number, activePaths: ReadonlySet<string> = new Set()): ExportFileInfo[] {
  return files.filter((file) => {
    if (activePaths.has(file.path)) return false;
    if (!Number.isFinite(file.modifiedMs) || file.modifiedMs > nowMs) return false;
    return nowMs - file.modifiedMs > maxAgeMs;
  });
}
