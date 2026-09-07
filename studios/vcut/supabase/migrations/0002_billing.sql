-- profiles: one row per Supabase auth user, tracking their VCut Pro subscription state.
--
-- Nothing about editing/exporting a project needs this table — it exists purely so any hosted route
-- (and, via GET /api/vcut/billing/status, any desktop/mobile client signed into the same Supabase
-- project) can answer "is this user currently Pro" without calling out to Stripe on every request.
--
-- Written to in exactly two places: `billing/webhook/route.ts` (Stripe is the source of truth —
-- `checkout.session.completed` sets stripe_customer_id, `customer.subscription.updated`/`.deleted`
-- set plan/current_period_end) and nowhere else. `billing/checkout/route.ts` only ever READS
-- stripe_customer_id (to decide whether to create a new Stripe customer or reuse one); it never
-- writes plan itself — that would let a client claim Pro without Stripe ever confirming payment.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- The one lookup the webhook needs going the OTHER direction: a Stripe event carries a customer id,
-- not a Supabase user id, so `webhook/route.ts` finds the row to update by this column.
create unique index if not exists profiles_stripe_customer_id_idx on profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Row-level security: same defense-in-depth reasoning as projects_index's own migration — every real
-- read/write here goes through the service-role client (webhook, checkout, status routes all use
-- getSupabaseAdminClient), which bypasses RLS entirely, so this only matters if a future change ever
-- exposes this table to a browser's own anon-key client. No insert/update/delete policy is defined at
-- all: a user's plan must never be settable by anything other than the Stripe webhook confirming an
-- actual payment, so there is deliberately no policy that would let even that same user's own session
-- write their own row.
alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);
