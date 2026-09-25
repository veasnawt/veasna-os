/** Durable records for credits spent on jobs that run in this process's memory — pure logic, storage injected
 *  so it can be unit-tested.
 *
 *  The problem: AI video, Remove Object, Auto Captions (and the other billed calls) charge credits up front
 *  and refund only from the job's own failure branch. A deploy or crash kills the process mid-job, so nothing
 *  ever runs that branch: the credits are gone, no result exists, and (for the provider-backed ones) the
 *  provider may keep billing. A "hold" is a database row written when the job starts and deleted when it ends
 *  (success, failure or cancel — each already settles credits its own way). Any row still present whose owner
 *  has stopped heartbeating belongs to a process that died, and is refunded exactly once by whichever live
 *  instance claims it first.
 *
 *  Heartbeats (not "any row from another instance") because a rolling deploy runs the old and new containers
 *  side by side: the new one must not refund jobs the old one is still healthily running. */

export interface HoldRow {
  id: string;
  userId: string;
  feature: string;
  amount: number;
}

export interface HoldStore {
  insert(hold: { userId: string; feature: string; amount: number; instanceId: string }): Promise<string>;
  remove(id: string): Promise<void>;
  /** Marks every hold owned by `instanceId` as alive right now. */
  heartbeat(instanceId: string): Promise<void>;
  /** Holds whose heartbeat is older than `olderThanMs` ago. */
  findStale(olderThanMs: number, limit: number): Promise<HoldRow[]>;
  /** Atomically deletes `id` only if it is STILL stale, returning whether THIS caller removed it — so two
   *  instances sweeping at once can't both refund the same hold. */
  claimStale(id: string, olderThanMs: number): Promise<boolean>;
}

export interface JobHoldsOptions {
  store: HoldStore;
  refund: (userId: string, amount: number) => Promise<void>;
  instanceId: string;
  /** Called with a message for anything worth a log line; defaults to console.error. */
  log?: (message: string, detail?: unknown) => void;
}

export const HOLD_HEARTBEAT_MS = 30_000;
/** Five missed heartbeats — long enough that a GC pause or slow database call never looks like a death. */
export const HOLD_ORPHAN_AFTER_MS = 150_000;
export const HOLD_SWEEP_MS = 60_000;

export class JobHolds {
  private readonly options: JobHoldsOptions;

  constructor(options: JobHoldsOptions) {
    this.options = options;
  }

  private log(message: string, detail?: unknown): void {
    (this.options.log ?? ((m, d) => console.error(m, d ?? "")))(message, detail);
  }

  /** Records that `amount` credits were just spent on a job for `userId`. Returns the hold id to release
   *  later, or `null` when nothing was recorded (no user / non-positive amount / the store failed) — a job
   *  simply runs unprotected then, exactly as before holds existed, rather than failing over bookkeeping. */
  async register(userId: string | undefined | null, feature: string, amount: number): Promise<string | null> {
    if (!userId || !(amount > 0)) return null;
    try {
      return await this.options.store.insert({ userId, feature, amount, instanceId: this.options.instanceId });
    } catch (err) {
      this.log("[vcut] holds: could not record a hold (job continues unprotected)", err);
      return null;
    }
  }

  /** The job finished (any outcome) — its credits are settled by its own success/failure path. */
  async release(holdId: string | null | undefined): Promise<void> {
    if (!holdId) return;
    try {
      await this.options.store.remove(holdId);
    } catch (err) {
      // A finished job whose hold couldn't be deleted keeps being heartbeated by this (live) instance, so
      // the sweeper will never treat it as an orphan — nothing is refunded wrongly, but the row lingers
      // until this process restarts, at which point it goes stale and WOULD be refunded (a free credit).
      // Rare (needs the database to fail exactly here), so it's logged loudly rather than retried.
      this.log("[vcut] holds: could not release hold", { holdId, err });
    }
  }

  async beat(): Promise<void> {
    try {
      await this.options.store.heartbeat(this.options.instanceId);
    } catch (err) {
      this.log("[vcut] holds: heartbeat failed", err);
    }
  }

  /** Refunds every hold whose owner stopped heartbeating, once each. Returns how many were refunded. */
  async sweep(): Promise<number> {
    let refunded = 0;
    let stale: HoldRow[];
    try {
      stale = await this.options.store.findStale(HOLD_ORPHAN_AFTER_MS, 50);
    } catch (err) {
      this.log("[vcut] holds: could not look for orphaned holds", err);
      return 0;
    }
    for (const hold of stale) {
      try {
        if (!(await this.options.store.claimStale(hold.id, HOLD_ORPHAN_AFTER_MS))) continue; // someone else got it
        await this.options.refund(hold.userId, hold.amount);
        refunded++;
        this.log(`[vcut] holds: refunded ${hold.amount} credits to ${hold.userId} for an interrupted ${hold.feature} job`);
      } catch (err) {
        // The row is already claimed (deleted), so a failed refund is not retried automatically — logged with
        // everything needed to make it whole by hand.
        this.log("[vcut] holds: REFUND FAILED after claiming an orphaned hold — refund manually", { hold, err });
      }
    }
    return refunded;
  }
}
