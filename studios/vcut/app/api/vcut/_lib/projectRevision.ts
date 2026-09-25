/** Optimistic-concurrency rules for saving a project — pure, so they can be unit-tested.
 *
 *  Two tabs (or a laptop and a phone) can have the same project open. Each save used to simply overwrite the
 *  file, so whichever saved last silently erased the other's edits. Now every stored project carries a
 *  `revision` number, bumped on each save. A client sends the revision it last loaded or saved (`baseRevision`);
 *  if the file has moved on since, the save is refused with a conflict instead of clobbering it, and the
 *  client asks the user which version to keep.
 *
 *  The number lives INSIDE `project.json` (not beside it) so it is written in the same atomic rename as the
 *  content it describes — a crash can never leave them disagreeing. */

/** The revision recorded in a stored project file's raw JSON; `0` for files written before revisions existed
 *  or that can't be read (so a first save from any client is accepted). */
export function readRevision(rawJson: string): number {
  try {
    const parsed = JSON.parse(rawJson) as { revision?: unknown };
    return typeof parsed.revision === "number" && Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0;
  } catch {
    return 0;
  }
}

export type RevisionCheck = { ok: true; nextRevision: number } | { ok: false; storedRevision: number };

/** Decides whether a save may proceed. A save with no `baseRevision` (an older client, or a caller that has no
 *  revision to send) is accepted — it just can't be protected. `force` is the user's explicit "keep my
 *  version". */
export function checkRevision(storedRevision: number, baseRevision: unknown, force: boolean): RevisionCheck {
  if (!force && typeof baseRevision === "number" && baseRevision !== storedRevision) return { ok: false, storedRevision };
  return { ok: true, nextRevision: storedRevision + 1 };
}

/** `serializedProject` (the validated project JSON) with `revision` written into it. */
export function stampRevision(serializedProject: string, revision: number): string {
  const parsed = JSON.parse(serializedProject) as Record<string, unknown>;
  parsed.revision = revision;
  // Pretty-printed like `serializeProject` (a project file a human can read and diff).
  return JSON.stringify(parsed, null, 2);
}
