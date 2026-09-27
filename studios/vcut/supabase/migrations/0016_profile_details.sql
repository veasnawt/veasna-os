-- Public profile details. Writes remain restricted to authenticated server routes.
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists avatar_path text;

alter table profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 160);
