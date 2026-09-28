-- Cross-platform billing architecture: unified subscriptions and idempotent credit transactions.
--
-- Extends VCut's billing model so entitlements and credits can originate from Stripe (web),
-- Google Play (Android), or Apple In-App Purchase (iOS, future-ready) under one canonical model.
--
-- Written to exclusively by the server (service_role client). RLS allows users to view their own
-- records, while mutations occur through verified backend endpoints.

-- 1. Unified subscriptions table
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'google_play', 'apple', 'beta')),
  provider_subscription_id text not null,
  provider_customer_id text,
  status text not null check (status in ('active', 'trialing', 'canceled', 'expired', 'in_grace_period', 'on_hold', 'paused')),
  plan text not null default 'pro' check (plan in ('free', 'pro')),
  product_id text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  environment text not null default 'production' check (environment in ('production', 'test', 'sandbox')),
  purchase_token text,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_provider_sub_id_unique unique (provider, provider_subscription_id)
);

create index if not exists subscriptions_user_status_idx on subscriptions (user_id, status);
create index if not exists subscriptions_purchase_token_idx on subscriptions (purchase_token)
  where purchase_token is not null;

-- 2. Unified credit transactions ledger (idempotent credit tracking)
create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'google_play', 'apple', 'system', 'beta')),
  provider_transaction_id text not null,
  product_id text,
  credits_amount int not null,
  type text not null check (type in ('subscription_allotment', 'consumable_pack', 'refund', 'bonus', 'beta_grant')),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'refunded', 'revoked')),
  raw_data jsonb,
  created_at timestamptz not null default now(),
  constraint credit_transactions_provider_tx_unique unique (provider, provider_transaction_id)
);

create index if not exists credit_transactions_user_idx on credit_transactions (user_id, created_at desc);

-- 3. Row-level security
alter table subscriptions enable row level security;
alter table credit_transactions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'subscriptions' and policyname = 'Users can view their own subscriptions'
  ) then
    create policy "Users can view their own subscriptions"
      on subscriptions for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'credit_transactions' and policyname = 'Users can view their own credit transactions'
  ) then
    create policy "Users can view their own credit transactions"
      on credit_transactions for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- Table grants
revoke all on table subscriptions from public, anon, authenticated;
grant select on table subscriptions to authenticated;
grant all on table subscriptions to service_role;

revoke all on table credit_transactions from public, anon, authenticated;
grant select on table credit_transactions to authenticated;
grant all on table credit_transactions to service_role;

-- 4. Idempotent credit grant function
create or replace function grant_credits_idempotent(
  p_user_id uuid,
  p_amount int,
  p_provider text,
  p_transaction_id text,
  p_product_id text default null,
  p_type text default 'consumable_pack',
  p_raw_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already_exists boolean;
  v_new_balance int;
begin
  -- 1. Check idempotency: if this provider + transaction was already completed, return without double-granting
  select exists (
    select 1 from credit_transactions
    where provider = p_provider and provider_transaction_id = p_transaction_id
  ) into v_already_exists;

  if v_already_exists then
    select credits_remaining into v_new_balance from profiles where id = p_user_id;
    return jsonb_build_object(
      'success', true,
      'already_processed', true,
      'credits_remaining', coalesce(v_new_balance, 0)
    );
  end if;

  -- 2. Lock and update profile credits
  insert into profiles (id, plan, credits_remaining, credits_reset_at)
  values (p_user_id, 'free', 90 + p_amount, now() + interval '1 month')
  on conflict (id) do update
    set credits_remaining = profiles.credits_remaining + p_amount,
        updated_at = now()
  returning credits_remaining into v_new_balance;

  -- 3. Insert transaction record
  insert into credit_transactions (
    user_id, provider, provider_transaction_id, product_id, credits_amount, type, status, raw_data
  ) values (
    p_user_id, p_provider, p_transaction_id, p_product_id, p_amount, p_type, 'completed', p_raw_data
  );

  return jsonb_build_object(
    'success', true,
    'already_processed', false,
    'credits_remaining', v_new_balance
  );
end;
$$;

-- 5. Idempotent credit revocation / refund function
create or replace function revoke_credits_idempotent(
  p_user_id uuid,
  p_amount int,
  p_provider text,
  p_transaction_id text,
  p_reason text default 'refund'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance int;
begin
  -- Mark transaction revoked/refunded if present
  update credit_transactions
  set status = 'refunded',
      raw_data = coalesce(raw_data, '{}'::jsonb) || jsonb_build_object('revocation_reason', p_reason, 'revoked_at', now())
  where provider = p_provider and provider_transaction_id = p_transaction_id;

  -- Deduct credits (floor at 0)
  update profiles
  set credits_remaining = greatest(0, credits_remaining - p_amount),
      updated_at = now()
  where id = p_user_id
  returning credits_remaining into v_new_balance;

  return jsonb_build_object(
    'success', true,
    'credits_remaining', coalesce(v_new_balance, 0)
  );
end;
$$;

revoke execute on function grant_credits_idempotent(uuid, int, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function grant_credits_idempotent(uuid, int, text, text, text, text, jsonb) to service_role;

revoke execute on function revoke_credits_idempotent(uuid, int, text, text, text) from public, anon, authenticated;
grant execute on function revoke_credits_idempotent(uuid, int, text, text, text) to service_role;
