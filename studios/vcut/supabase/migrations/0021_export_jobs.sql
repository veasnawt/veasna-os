-- Durable background export jobs table and queue orchestration.
--
-- Replaces the in-memory Map in export/route.ts with a persistent, durable job model.
-- Workers claim jobs using PostgreSQL's row-level locking (`FOR UPDATE SKIP LOCKED`),
-- preventing duplicate execution and surviving web/worker container restarts.
--
-- Written to exclusively by the server / worker (service_role client). RLS allows authenticated
-- users to view their own export jobs.

create table if not exists vcut_export_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  job_type text not null default 'video_export',
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  phase text not null default 'queued' check (phase in ('queued', 'preparing', 'rendering-text', 'encoding', 'finalizing')),
  progress real not null default 0.0 check (progress >= 0.0 and progress <= 1.0),
  message text,
  file_name text not null,
  output_path text,
  output_url text,
  error_message text,
  project_snapshot jsonb not null,
  include_outro boolean not null default true,
  worker_id text,
  heartbeat_at timestamptz,
  attempt_count int not null default 0,
  max_attempts int not null default 2,
  cancellation_requested boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Partial indexes for optimal queue throughput and heartbeat sweeping
create index if not exists vcut_export_jobs_queue_idx
  on vcut_export_jobs (created_at asc)
  where status = 'queued';

create index if not exists vcut_export_jobs_heartbeat_idx
  on vcut_export_jobs (heartbeat_at)
  where status = 'processing';

create index if not exists vcut_export_jobs_project_status_idx
  on vcut_export_jobs (project_id, status);

create index if not exists vcut_export_jobs_user_idx
  on vcut_export_jobs (user_id, created_at desc);

-- Row-level security
alter table vcut_export_jobs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'vcut_export_jobs' and policyname = 'Users can view their own export jobs'
  ) then
    create policy "Users can view their own export jobs"
      on vcut_export_jobs for select
      using (auth.uid() = user_id);
  end if;
end $$;

revoke all on table vcut_export_jobs from public, anon, authenticated;
grant select on table vcut_export_jobs to authenticated;
grant all on table vcut_export_jobs to service_role;

-- Atomically claims a queued job (or a dead worker's stalled processing job) for execution.
-- Uses `FOR UPDATE SKIP LOCKED` to allow multiple concurrent workers without race conditions.
create or replace function claim_vcut_export_job(
  p_worker_id text,
  p_stale_after_seconds int default 90
)
returns setof vcut_export_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  -- 1. Try to find a fresh queued job first, or a stalled processing job past its heartbeat lease
  select id into v_job_id
  from vcut_export_jobs
  where (
    status = 'queued'
    or (
      status = 'processing'
      and heartbeat_at < (now() - (p_stale_after_seconds || ' seconds')::interval)
      and cancellation_requested = false
      and attempt_count < max_attempts
    )
  )
  order by
    case when status = 'queued' then 0 else 1 end,
    created_at asc
  limit 1
  for update skip locked;

  if v_job_id is null then
    return;
  end if;

  -- 2. Claim the job and update its execution metadata
  return query
  update vcut_export_jobs
  set status = 'processing',
      phase = 'preparing',
      worker_id = p_worker_id,
      attempt_count = attempt_count + 1,
      heartbeat_at = now(),
      started_at = coalesce(started_at, now())
  where id = v_job_id
  returning *;
end;
$$;

-- Heartbeats an active job to keep its lease alive and reports latest progress.
-- Returns whether cancellation has been requested by the user.
create or replace function heartbeat_vcut_export_job(
  p_job_id uuid,
  p_worker_id text,
  p_progress real default null,
  p_phase text default null,
  p_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancel boolean;
begin
  update vcut_export_jobs
  set heartbeat_at = now(),
      progress = coalesce(p_progress, progress),
      phase = coalesce(p_phase, phase),
      message = coalesce(p_message, message)
  where id = p_job_id
    and worker_id = p_worker_id
    and status = 'processing'
  returning cancellation_requested into v_cancel;

  return coalesce(v_cancel, false);
end;
$$;

revoke execute on function claim_vcut_export_job(text, int) from public, anon, authenticated;
grant execute on function claim_vcut_export_job(text, int) to service_role;

revoke execute on function heartbeat_vcut_export_job(uuid, text, real, text, text) from public, anon, authenticated;
grant execute on function heartbeat_vcut_export_job(uuid, text, real, text, text) to service_role;
