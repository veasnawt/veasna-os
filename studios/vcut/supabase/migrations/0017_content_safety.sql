-- Public beta safety controls. Run manually in the Supabase SQL editor before deployment.
-- Reports are private. Only their author and service-role moderation can read them.
begin;
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('creator','template','comment')),
  target_id text not null check (length(target_id) between 1 and 128),
  target_owner_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','sexual','violence','copyright','other')),
  details text not null default '' check (length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (reporter_id,target_type,target_id)
);
create index if not exists content_reports_pending_idx on public.content_reports(status,created_at);
alter table public.content_reports enable row level security;
drop policy if exists reports_read_own on public.content_reports;
create policy reports_read_own on public.content_reports for select to authenticated using (reporter_id=auth.uid());
-- Writes go through authenticated server endpoints: validate public targets, rate limit and sanitize.
revoke all on public.content_reports from anon, authenticated;
grant select on public.content_reports to authenticated;
grant all on public.content_reports to service_role;
create table if not exists public.user_blocks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_id,blocked_user_id),
  check(owner_id <> blocked_user_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_user_id);
alter table public.user_blocks enable row level security;
drop policy if exists blocks_read_own on public.user_blocks;
create policy blocks_read_own on public.user_blocks for select to authenticated using (owner_id=auth.uid());
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;
grant all on public.user_blocks to service_role;
commit;