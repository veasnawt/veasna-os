-- Approved private feedback inbox. Run manually in Supabase before deploying the feedback endpoint.
-- Adds one table; does not delete or alter existing user/project data.
begin;
create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'idea')),
  message text not null check (length(message) between 2 and 2000),
  diagnostics jsonb check (diagnostics is null or (jsonb_typeof(diagnostics) = 'object' and octet_length(diagnostics::text) <= 4000)),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists user_feedback_queue_idx on public.user_feedback(status, created_at);
create index if not exists user_feedback_user_idx on public.user_feedback(user_id, created_at);
alter table public.user_feedback enable row level security;
-- No direct client access: authenticated endpoint validates, rate limits and inserts using service role.
revoke all on public.user_feedback from anon, authenticated;
grant all on public.user_feedback to service_role;
commit;
