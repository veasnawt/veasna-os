/** Tracks how many HEAVY ffmpeg jobs — a real export, or a template's own preview render — are
 *  running RIGHT NOW across this one shared server process. `export/route.ts` already hard-rejects a
 *  THIRD concurrent export outright (`MAX_CONCURRENT_HOSTED_EXPORTS` below, moved here from that file
 *  so both callers reference the exact same configured limit) — its own doc comment there explains why
 *  this modest, single-instance container can't handle more. That gate only ever counted OTHER real
 *  exports against itself, though: `renderTemplatePreview`'s own two ffmpeg passes (`_lib/templates.ts`,
 *  added when template previews gained a full-quality/full-duration render) ran through a completely
 *  separate code path with no concurrency awareness at all — confirmed as a real, reported regression:
 *  a small, simple project's own export got killed by the kernel OOM-killer not because IT was heavy,
 *  but because an unrelated template save was running its own full-quality preview render on the SAME
 *  container at the same moment, pushing total concurrent ffmpeg load past what this container's memory
 *  can hold.
 *
 *  This shared counter is the fix: `export/route.ts` brackets each export job's whole lifetime with
 *  `beginHeavyFfmpegJob`/`endHeavyFfmpegJob`, and `_lib/templates.ts` does the same around each of its
 *  own two render passes, additionally calling `waitForFfmpegHeadroom` FIRST — a template save has no
 *  user staring at a progress bar the way an export's own SSE connection does, so it can afford to wait
 *  a few extra seconds for room instead of piling onto a container already at its real export limit,
 *  where a hard rejection (export/route.ts's own behavior) would just turn a save failure into a NEW
 *  user-visible error for no good reason. */
export const MAX_CONCURRENT_HOSTED_EXPORTS = Number(process.env.VCUT_MAX_CONCURRENT_EXPORTS) || 2;

let runningHeavyJobs = 0;

export function beginHeavyFfmpegJob(): void {
  runningHeavyJobs++;
}

export function endHeavyFfmpegJob(): void {
  runningHeavyJobs = Math.max(0, runningHeavyJobs - 1);
}

/** Polls until fewer than `maxConcurrent` heavy jobs are running, or `timeoutMs` elapses — whichever
 *  comes first. Gives up and proceeds anyway past the timeout rather than hanging a template save
 *  forever: a genuinely stuck job (see `MAX_CONCURRENT_HOSTED_EXPORTS`'s own doc comment on why a
 *  stuck job is worse here than elsewhere) would otherwise starve every future template save exactly
 *  the way it already once starved every future export, which is a worse outcome than temporarily
 *  reverting to this function's pre-existing unbounded-concurrency behavior. */
export async function waitForFfmpegHeadroom(maxConcurrent: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (runningHeavyJobs >= maxConcurrent && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
