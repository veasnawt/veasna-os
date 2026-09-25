-- Durable records of credits spent on jobs that run in a server process's memory (AI video, Remove Object,
-- Auto Captions). A row is written when the job starts and deleted when it ends; a row whose owning
-- process has stopped heartbeating is an orphan from a deploy/crash and gets refunded once by whichever live
-- instance claims it first. See `_lib/jobHoldsService.ts`.
--
-- Service-role only, like the credit functions (0012): no RLS policies, and access revoked from the public
-- roles, so nothing a client holds can read or write it.

create table if not exists job_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature text not null,
  amount int not null check (amount > 0),
  instance_id text not null,
  heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists job_holds_instance_idx on job_holds (instance_id);
create index if not exists job_holds_heartbeat_idx on job_holds (heartbeat_at);

alter table job_holds enable row level security;

revoke all on table job_holds from public, anon, authenticated;
grant all on table job_holds to service_role;
