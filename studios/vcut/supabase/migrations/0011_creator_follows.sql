-- Follow a creator (Phase 3 extension) -- the richer /u/[id] profile page (Following/Followers/Likes
-- counts, a Follow button) needs a real follow relationship, not just the like/comment tables
-- migration 0010 already added.
--
-- `(follower_id, followed_id)` IS the primary key, same "the pair itself is the uniqueness constraint"
-- convention `template_likes` already established -- following someone you already follow is an
-- idempotent upsert, never a duplicate-row error.
create table if not exists creator_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint creator_follows_no_self_follow check (follower_id <> followed_id)
);
-- Counting a creator's OWN followers is the common read (every profile page load); counting who ONE
-- viewer follows is the rarer one (their own "Following" count on their own page) -- the primary key's
-- own leading column already covers that direction, so only the reverse needs its own index.
create index if not exists creator_follows_followed_id_idx on creator_follows (followed_id);

alter table creator_follows enable row level security;

-- Follow counts are public data (shown on anyone's profile page, no sign-in required -- see /u/[id]'s
-- own doc comment), so read access is unrestricted, same posture `template_likes`'s own "Anyone can
-- view likes on a public template" policy already takes.
create policy "Anyone can view follow relationships"
  on creator_follows for select
  using (true);

create policy "Users can follow someone as themselves"
  on creator_follows for insert
  with check (auth.uid() = follower_id);

create policy "Users can unfollow as themselves"
  on creator_follows for delete
  using (auth.uid() = follower_id);
