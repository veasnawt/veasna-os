-- templates: Pro users' saved edits, reusable as a starting point for a new project.
--
-- A template keeps the WHOLE edit — sequence dimensions/fps, every track, every clip's own timing/
-- transform/effects/color-grading/keyframes/transitions, and any text or music — just with a video/
-- audio/image clip's real FILE replaced by a fillable placeholder (`Asset.templatePlaceholder`):
-- there's no real footage to carry forward into a stranger's next project the way there is for
-- `projects_index`'s own full project.json (see that table's own doc comment on why THAT one stores
-- only an index, not content) — a template's own content is small and self-contained enough to store
-- directly here as JSONB, rather than needing a companion file on disk the way a real project's
-- assets do.
--
-- `project` holds the already-sanitized shape `project/template.ts`'s `sanitizeProjectForTemplate`
-- produces (`{ width, height, fps, tracks, assets }`), not a full `Project` — see that function's own
-- doc comment for exactly what's kept and why. `project/template.ts`'s `templateSlots`/
-- `fillTemplateSlot` are what a new project built from one of these actually does with those
-- placeholders once someone picks their own media to fill them in.
--
-- Same `id text primary key` / `owner_id uuid ... references auth.users` / RLS shape as
-- `projects_index` (0001) — a template is user-owned and mutable the same way a project is, not
-- admin-only the way `profiles.plan` is.

create table if not exists templates (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled',
  project jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same query pattern `projects_index_owner_id_idx` exists to serve, for the same reason: "every
-- template I own, newest first" and "does this id belong to me" both filter/sort on owner_id.
create index if not exists templates_owner_id_idx on templates (owner_id, updated_at desc);

-- Defense-in-depth, same reasoning `projects_index`'s own RLS comment gives — every read/write here
-- goes through the server's service-role client, which bypasses RLS entirely, so this costs that path
-- nothing; it's what stops one user's tab from touching another's row if this table is ever exposed
-- to a browser client directly.
alter table templates enable row level security;

create policy "Users can view their own templates"
  on templates for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own templates"
  on templates for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own templates"
  on templates for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own templates"
  on templates for delete
  using (auth.uid() = owner_id);
