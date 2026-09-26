-- Custom usernames: lowercase, unique, 3-20 chars of [a-z0-9_] — same "add a nullable column, validate
-- in the API route, write through the service-role client" shape `display_name` (0010_templates_social.sql)
-- already established for `profiles`. The CHECK constraint is extra defense-in-depth specifically because
-- this value (unlike display_name) is meant to appear in a public URL path (`/u/<username>`) — the API
-- route is still the primary place format is validated and where a clean "already taken" error comes
-- from, but a malformed value should never be able to reach the column even if some future write path
-- forgets to validate first.
--
-- No `citext`/case-folding needed: the API route always lowercases before writing, so a PLAIN unique
-- index on the column already gives case-insensitive-in-effect uniqueness — nothing is ever stored
-- non-lowercase for the index to need to fold.
alter table profiles add column if not exists username text;

alter table profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

create unique index if not exists profiles_username_idx on profiles (username)
  where username is not null;
