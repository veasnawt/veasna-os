-- user_media: a Pro/hosted user's own reusable media library — imports AND AI generations alike,
-- shared across every one of their projects instead of living inside any single project's own
-- storage the way it did before this existed.
--
-- Mirrors `Asset` (packages/vcut/src/project/types.ts) closely on purpose — a row here is what a
-- project's own `project.assets` entry points AT (via that entry's `libraryMediaId`) once an asset
-- is library-backed, so the two shapes need to carry the same real information (dimensions, duration,
-- the AI generation prompt/model if any) for the client to render a library tile identically to how
-- it already renders a project-local one.
--
-- `rel_path`/`thumbnail_rel_path`/etc. are relative to `VCUT_ROOT/users/<owner_id>/...` (see
-- `_lib/paths.ts`'s own `userMediaPaths`), a sibling of the per-project folders `projects_index`'s own
-- doc comment describes — never nested under any one project, since the whole point is outliving and
-- being shared across all of them.
--
-- Same `id text primary key` / `owner_id uuid ... references auth.users` / RLS shape every other
-- user-owned table here already uses (`projects_index`, `templates`).

create table if not exists user_media (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('video', 'audio', 'image')),
  name text not null,
  rel_path text not null,
  thumbnail_rel_path text,
  filmstrip_rel_path text,
  waveform_rel_path text,
  duration real not null default 0,
  width int,
  height int,
  fps real,
  has_audio boolean not null default false,
  size_bytes bigint not null default 0,
  -- {prompt, aspectRatio, model} — present only for an AI-generated entry, same shape (and same
  -- reason for existing) as Asset.aiGeneration.
  ai_generation jsonb,
  created_at timestamptz not null default now()
);

-- "Every library item this user owns, newest first" — the one real query pattern this table serves,
-- same reasoning `projects_index_owner_id_idx`/`templates_owner_id_idx` already document.
create index if not exists user_media_owner_id_idx on user_media (owner_id, created_at desc);

-- Used to add up a user's total library size against their plan's storage cap (see
-- `_lib/userMedia.ts`'s own `getStorageUsageBytes`) — a partial sum over owner_id is exactly what this
-- index above already supports well; nothing extra needed here beyond it existing.

alter table user_media enable row level security;

create policy "Users can view their own media"
  on user_media for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own media"
  on user_media for insert
  with check (auth.uid() = owner_id);

create policy "Users can delete their own media"
  on user_media for delete
  using (auth.uid() = owner_id);
