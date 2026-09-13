-- Phase 3 of the Templates tab: creator identity + real Like/Comment on public templates.
--
-- `profiles.display_name` — the ONE new field a "creator profile" needs, given Phase 3's own scoping
-- decision to skip real avatar uploads for now (an auto-generated colored-initial avatar is computed
-- entirely client-side from this name/the user's own id — nothing stored for it at all). Nullable: a
-- user who's never set one just shows a generated fallback (e.g. "User" + a short id suffix) client-
-- side, same "absent is a normal, handled state" convention every other optional column in this schema
-- already follows. Deliberately NO new RLS policy alongside this — `profiles` (0002_billing.sql) has
-- NEVER had a client-writable policy at all, on purpose ("a user's plan must never be settable by
-- anything other than the Stripe webhook"); a display name update goes through a new server route
-- using the same service-role client every other write to this table already uses, same as before this
-- column existed — respecting that original decision rather than loosening it.
alter table profiles add column if not exists display_name text;

-- template_likes: one row per (template, user) who liked it. Primary key IS the uniqueness
-- constraint — a second "like" from the same user is an upsert-shaped no-op, not a new row, so a
-- count is always a plain row count, never needs DISTINCT.
create table if not exists template_likes (
  template_id text not null references templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (template_id, user_id)
);
create index if not exists template_likes_template_id_idx on template_likes (template_id);

alter table template_likes enable row level security;

create policy "Anyone can view likes on a public template"
  on template_likes for select
  using (exists (select 1 from templates t where t.id = template_id and t.is_public));

create policy "Users can like a public template as themselves"
  on template_likes for insert
  with check (auth.uid() = user_id and exists (select 1 from templates t where t.id = template_id and t.is_public));

create policy "Users can remove their own like"
  on template_likes for delete
  using (auth.uid() = user_id);

-- template_comments: plain flat comments (no threading/replies — out of scope for Phase 3), only ever
-- meaningful on a PUBLIC template (private templates have no other viewer to comment). `id` is a
-- client-minted `text` id, same convention `templates.id`/`projects_index.id` already use rather than
-- a DB-generated uuid.
create table if not exists template_comments (
  id text primary key,
  template_id text not null references templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists template_comments_template_id_idx on template_comments (template_id, created_at);

alter table template_comments enable row level security;

create policy "Anyone can view comments on a public template"
  on template_comments for select
  using (exists (select 1 from templates t where t.id = template_id and t.is_public));

create policy "Users can comment on a public template as themselves"
  on template_comments for insert
  with check (auth.uid() = user_id and exists (select 1 from templates t where t.id = template_id and t.is_public));

-- Deliberately no client-side delete policy: "delete your own comment, or any comment on your own
-- template" (Phase 3's own moderation scope) needs an OR-across-two-tables check plain row-level
-- `using` can express, but every real delete already goes through the server's service-role client
-- (`templates/[id]/comments/[commentId]/route.ts`), which enforces exactly that rule in application
-- code — same "RLS is defense-in-depth, not the enforcement path" posture every other table here
-- already takes for its own mutations.
create policy "Users can delete their own comment"
  on template_comments for delete
  using (auth.uid() = user_id);
