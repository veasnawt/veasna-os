import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { refundCredits } from "./credits";
import { HOLD_HEARTBEAT_MS, HOLD_SWEEP_MS, JobHolds, type HoldRow, type HoldStore } from "./jobHoldsService";
import { VCUT_HOSTED } from "./auth";

/** Supabase-backed `HoldStore` over the `job_holds` table (migration `0013_job_holds.sql`). Service-role only. */
const supabaseStore: HoldStore = {
  async insert({ userId, feature, amount, instanceId }) {
    const { data, error } = await getSupabaseAdminClient()
      .from("job_holds")
      .insert({ user_id: userId, feature, amount, instance_id: instanceId })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("no row returned");
    return data.id as string;
  },
  async remove(id) {
    const { error } = await getSupabaseAdminClient().from("job_holds").delete().eq("id", id);
    if (error) throw error;
  },
  async heartbeat(instanceId) {
    const { error } = await getSupabaseAdminClient().from("job_holds").update({ heartbeat_at: new Date().toISOString() }).eq("instance_id", instanceId);
    if (error) throw error;
  },
  async findStale(olderThanMs, limit): Promise<HoldRow[]> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const { data, error } = await getSupabaseAdminClient().from("job_holds").select("id, user_id, feature, amount").lt("heartbeat_at", cutoff).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, userId: r.user_id, feature: r.feature, amount: r.amount }));
  },
  async claimStale(id, olderThanMs) {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    // `delete ... returning`: only the caller that actually removes the row gets it back.
    const { data, error } = await getSupabaseAdminClient().from("job_holds").delete().eq("id", id).lt("heartbeat_at", cutoff).select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  },
};

/** Identifies this server process; a fresh value per boot, so a restarted container's old holds go stale. */
const INSTANCE_ID = crypto.randomUUID();

const holds = new JobHolds({ store: supabaseStore, refund: refundCredits, instanceId: INSTANCE_ID });

/** Records credits spent on an in-memory job — see `jobHoldsService.ts`. Hosted deployment only (local
 *  installs have no credits). Never throws; `null` means unprotected. */
export function registerHold(userId: string | undefined | null, feature: string, amount: number): Promise<string | null> {
  if (!VCUT_HOSTED) return Promise.resolve(null);
  return holds.register(userId, feature, amount);
}

/** Call from every terminal path of a job (a `finally`) once its credits are settled. Fire-and-forget safe. */
export function releaseHold(holdId: string | null | undefined): Promise<void> {
  return holds.release(holdId);
}

let started = false;
/** Starts this instance's heartbeat and the periodic orphan sweep. Idempotent; called from `instrumentation.ts`
 *  at boot. Timers are unref'd so they never keep the process alive. */
export function startHoldSweeper(): void {
  if (started || !VCUT_HOSTED) return;
  started = true;
  setInterval(() => void holds.beat(), HOLD_HEARTBEAT_MS).unref?.();
  setInterval(() => void holds.sweep(), HOLD_SWEEP_MS).unref?.();
  // A first sweep shortly after boot catches the previous container's jobs without waiting a full interval.
  setTimeout(() => void holds.sweep(), 20_000).unref?.();
}
