-- Extend the original public-template comment table for one-level review threads.
-- Existing rows keep their template, author, body and timestamp unchanged.
-- Project reviews attach only to hosted projects with explicit owner/reviewer access.

create table if not exists project_reviewers (
  project_id text not null references projects_index(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_reviewers_user_idx on project_reviewers (user_id, project_id);
alter table project_reviewers enable row level security;
create policy "Project owner or reviewer can see review membership"
  on project_reviewers for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from projects_index p where p.id = project_reviewers.project_id and p.owner_id = auth.uid()
  ));
-- Membership changes go through authenticated routes, which also enforce the
-- existing block rules. No direct client INSERT/DELETE policy is granted.

alter table template_comments alter column template_id drop not null;
alter table template_comments add column if not exists project_id text references projects_index(id) on delete cascade;
alter table template_comments add column if not exists parent_comment_id text references template_comments(id) on delete cascade;
alter table template_comments add column if not exists timeline_time double precision;
alter table template_comments add column if not exists updated_at timestamptz;
alter table template_comments add column if not exists deleted_at timestamptz;
alter table template_comments add column if not exists resolved_at timestamptz;
alter table template_comments add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table template_comments add column if not exists reply_count integer not null default 0;
alter table template_comments add constraint review_comment_one_target
  check (num_nonnulls(template_id, project_id) = 1);
alter table template_comments add constraint review_comment_valid_time
  check (timeline_time is null or (timeline_time >= 0 and timeline_time <= 86400));
alter table template_comments add constraint review_comment_resolution_pair
  check (resolved_at is not null or resolved_by is null);
alter table template_comments add constraint review_comment_reply_count_nonnegative check (reply_count >= 0);
create index if not exists template_comments_project_thread_idx
  on template_comments (project_id, created_at, id) where project_id is not null;
create index if not exists template_comments_parent_idx
  on template_comments (parent_comment_id, created_at) where parent_comment_id is not null;
create index if not exists template_comments_project_markers_idx
  on template_comments (project_id, timeline_time)
  where project_id is not null and parent_comment_id is null and timeline_time is not null;

-- A foreign key alone would permit replies to replies or cross-project threads.
create or replace function validate_review_comment() returns trigger language plpgsql as $$
declare parent template_comments%rowtype;
begin
  if tg_op = 'INSERT' then new.reply_count := 0; end if;
  if new.parent_comment_id is not null then
    select * into parent from template_comments where id = new.parent_comment_id;
    if not found or parent.parent_comment_id is not null or parent.deleted_at is not null
       or parent.template_id is distinct from new.template_id
       or parent.project_id is distinct from new.project_id then
      raise exception 'A reply must belong to a root comment on the same target';
    end if;
    if new.timeline_time is not null or new.resolved_at is not null then
      raise exception 'Replies cannot have independent timestamps or resolution';
    end if;
  end if;
  if new.deleted_at is null and length(btrim(new.body)) = 0 then
    raise exception 'Comment body cannot be empty';
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or
       new.template_id is distinct from old.template_id or
       new.project_id is distinct from old.project_id or
       new.parent_comment_id is distinct from old.parent_comment_id or
       new.created_at is distinct from old.created_at then
      raise exception 'Comment identity and thread cannot be changed';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_review_comment_before_write
  before insert or update on template_comments
  for each row execute function validate_review_comment();

create or replace function maintain_review_reply_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.parent_comment_id is not null then
    update template_comments set reply_count = reply_count + 1 where id = new.parent_comment_id;
  elsif tg_op = 'DELETE' and old.parent_comment_id is not null then
    update template_comments set reply_count = greatest(0, reply_count - 1) where id = old.parent_comment_id;
  end if;
  return null;
end;
$$;
create trigger maintain_review_reply_count_after_write
  after insert or delete on template_comments
  for each row execute function maintain_review_reply_count();

-- Server routes use the service-role client after checking the caller. RLS also
-- protects direct client access and Supabase Realtime delivery of private rows.
-- A security-definer helper is needed here because the block table's own RLS
-- intentionally hides blocks made by the other party. Never accept a user ID
-- as an argument: the caller is always the authenticated session itself.
create or replace function can_read_project_review(review_project_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from projects_index p
    where p.id = review_project_id and (
      p.owner_id = auth.uid()
      or (
        exists (select 1 from project_reviewers r
          where r.project_id = p.id and r.user_id = auth.uid())
        and not exists (select 1 from user_blocks b
          where (b.owner_id = p.owner_id and b.blocked_user_id = auth.uid())
             or (b.owner_id = auth.uid() and b.blocked_user_id = p.owner_id))
      )
    )
  );
$$;
revoke all on function can_read_project_review(text) from public;
grant execute on function can_read_project_review(text) to authenticated;
create policy "Project owner and reviewers can read review comments"
  on template_comments for select to authenticated
  using (project_id is not null and can_read_project_review(project_id));
-- Project comment writes go through authenticated routes, which validate
-- mentions, ownership and the one-level thread rules before service-role writes.
-- Keep legacy direct template inserts, but prevent forged moderation metadata.
drop policy if exists "Users can comment on a public template as themselves" on template_comments;
create policy "Users can comment on a public template as themselves"
  on template_comments for insert to authenticated
  with check (template_id is not null and project_id is null and user_id = auth.uid()
    and updated_at is null and deleted_at is null and resolved_at is null
    and resolved_by is null and timeline_time is null
    and exists (select 1 from templates t where t.id = template_comments.template_id and t.is_public));
-- The pre-existing direct hard-delete policy could orphan a thread. All delete,
-- edit and resolve actions now go through the existing authenticated API pattern.
drop policy if exists "Users can delete their own comment" on template_comments;

-- Subscribe once per open project/template, with SELECT policies above filtering
-- private rows. The guard makes this safe if the publication was configured before.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'template_comments') then
    alter publication supabase_realtime add table template_comments;
  end if;
end $$;
