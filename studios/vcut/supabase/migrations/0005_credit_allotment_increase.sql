-- Raises both the free and Pro monthly credit allotments — see `_lib/credits.ts`'s own
-- `FREE_CREDITS_PER_MONTH`/`PRO_CREDITS_PER_MONTH` doc comment for the full reasoning: Pro's own
-- allotment and every per-operation credit cost (Remove Object, Captions) scale by the same 4x
-- factor together, so the real usage entitlement per dollar is UNCHANGED (300 credits ÷ 4/sec ==
-- 1200 credits ÷ 16/sec, both 75 seconds of Remove Object for $9.99/month) — this is a "bigger,
-- more generous-feeling numbers" change, not a margin change. Free goes from 5 (worth barely one
-- second of Remove Object — not a usable trial at all) to 90 (a genuine ~5.6-second Remove Object, or
-- ~22 minutes of Captions), a deliberately more generous free tier: worst-case real cost is
-- 90 ÷ 16 × $0.05 ≈ $0.28/month per free user, a trivial, ordinary freemium acquisition cost.
--
-- `spend_credits` (0003_credits.sql) is the one place these allotments are read from — redefining it
-- here (not editing that already-applied migration) is the correct way to change an existing
-- Postgres function; `create or replace` is idempotent and safe to re-run.
create or replace function spend_credits(p_user_id uuid, p_amount int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_credits int;
  v_reset timestamptz;
  v_allotment int;
begin
  select plan, credits_remaining, credits_reset_at into v_plan, v_credits, v_reset
  from profiles where id = p_user_id for update;

  if not found then
    insert into profiles (id, plan, credits_remaining, credits_reset_at)
    values (p_user_id, 'free', 90, now() + interval '1 month')
    returning plan, credits_remaining, credits_reset_at into v_plan, v_credits, v_reset;
  end if;

  v_allotment := case when v_plan = 'pro' then 1200 else 90 end;

  if v_reset <= now() then
    v_credits := v_allotment;
    v_reset := now() + interval '1 month';
  end if;

  if v_credits < p_amount then
    update profiles set credits_remaining = v_credits, credits_reset_at = v_reset, updated_at = now() where id = p_user_id;
    return false;
  end if;

  update profiles set credits_remaining = v_credits - p_amount, credits_reset_at = v_reset, updated_at = now() where id = p_user_id;
  return true;
end;
$$;

alter table profiles alter column credits_remaining set default 90;

-- One-time top-up for existing accounts, so the increase takes effect immediately instead of only on
-- each account's own next natural `credits_reset_at` (which could be up to a month away) — nobody's
-- balance goes DOWN, `greatest()` only ever raises it to the new allotment.
update profiles set credits_remaining = greatest(credits_remaining, case when plan = 'pro' then 1200 else 90 end);
