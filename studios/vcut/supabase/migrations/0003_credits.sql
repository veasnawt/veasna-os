-- Credits: how VCut Pro (and a small free taste) actually meters usage of centrally-funded features
-- (Auto Captions, Remove Object today; AI image/video generation and others later) — VCut pays ONE
-- provider account per feature, not each user their own key, so what needs limiting per-user is a
-- spend count, not a credential.

alter table profiles
  add column if not exists credits_remaining int not null default 5,
  add column if not exists credits_reset_at timestamptz not null default (now() + interval '1 month');

-- Audit trail only — never read to compute the actual balance (profiles.credits_remaining is the one
-- authoritative number, kept correct by spend_credits below). Exists so a support/debugging question
-- ("why did my credits drop") has a real answer, and to be the base for A future admin/analytics view.
create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  credits_spent int not null,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_id_idx on usage_events (user_id, created_at desc);

alter table usage_events enable row level security;

create policy "Users can view their own usage events"
  on usage_events for select
  using (auth.uid() = user_id);

-- The one place a spend is actually decided — `security definer` plus `for update` row-locking is
-- what makes two concurrent requests against the same balance impossible to both succeed past what's
-- actually available (the alternative, reading the balance in application code then writing back a
-- new value, has a real race window between those two steps that this closes entirely). Lazily
-- refills whenever `credits_reset_at` has passed, using the CURRENT plan's own allotment — free and
-- pro amounts live here as the one source of truth; `_lib/profiles.ts`'s `upsertPlanByStripeCustomerId`
-- ALSO sets these two columns directly on a plan change (immediate top-up on upgrade, tied to the
-- real Stripe billing period instead of waiting for this lazy path), so this function's own refill
-- branch mostly matters for free-plan users, who have no billing-period webhook to drive it.
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
    values (p_user_id, 'free', 5, now() + interval '1 month')
    returning plan, credits_remaining, credits_reset_at into v_plan, v_credits, v_reset;
  end if;

  v_allotment := case when v_plan = 'pro' then 300 else 5 end;

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
