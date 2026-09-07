-- projects_index: the ownership/listing index for VCut's hosted web deployment.
--
-- Deliberately NOT where project data itself lives — the actual timeline (assets, sequence, effects
-- — everything `Project` in packages/vcut/src/project/types.ts describes) stays exactly where it
-- always has, in project.json on the server's own persistent disk (see studios/vcut/app/api/vcut/
-- _lib/paths.ts). This table exists purely so two things become possible for a real public deployment
-- without touching that storage model at all:
--   1. "Which projects does this user own" — without it, answering that would mean reading every
--      OTHER tenant's project.json off disk just to filter them back out.
--   2. "Does this user own project X" — the ownership check every hosted-mode API request goes
--      through before it's allowed to touch that project's files at all (see
--      studios/vcut/app/api/vcut/_lib/localOnly.ts's VCUT_HOSTED branch).
--
-- Kept in sync by studios/vcut/app/api/vcut/project/route.ts: a row is inserted on POST (project
-- creation, the only place ownership is ever decided), kept current on every PUT (save), and removed
-- on DELETE. See that route's own comments for exactly where each call happens.

create table if not exists projects_index (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled',
  updated_at timestamptz not null default now()
);

-- The one query pattern this table exists to serve: "every project I own, newest-edited first"
-- (projects/route.ts's GET) and "does this specific id belong to me" (the ownership-check helper in
-- _lib/auth.ts). Both filter/sort on owner_id — this is what keeps either from ever needing a full
-- table scan as the user/project count grows.
create index if not exists projects_index_owner_id_idx on projects_index (owner_id, updated_at desc);

-- Row-level security: even though every read/write against this table goes through the server's own
-- service-role client (packages/auth/src/server.ts's getSupabaseAdminClient — see its own doc
-- comment on why: a trusted server process, not a browser holding a user's own anon-key session), RLS
-- is enabled anyway as defense-in-depth. If a future change ever exposes this table to a browser
-- client directly (the anon key, not the service key), these policies are what stop one user's tab
-- from reading or altering another's row even then — the service-role client itself bypasses RLS
-- entirely, so this costs it nothing today.
alter table projects_index enable row level security;

create policy "Users can view their own projects_index rows"
  on projects_index for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own projects_index rows"
  on projects_index for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own projects_index rows"
  on projects_index for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own projects_index rows"
  on projects_index for delete
  using (auth.uid() = owner_id);
