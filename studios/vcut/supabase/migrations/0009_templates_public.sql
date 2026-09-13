-- Phase 2 of the Templates tab: opt-in public sharing. A template stays private by default (matches
-- every template that already existed before this column did — `default false`, nothing changes for
-- them until their owner explicitly publishes). `is_public = true` is what the new "Discover" feed
-- (`_lib/templates.ts`'s own `listPublicTemplates`) reads, and what lets a NON-owner (including a
-- Free-plan viewer — publishing stays Pro-only, but browsing/using a published template doesn't, a
-- deliberate product decision) pass `getViewableTemplate`'s ownership-OR-public check instead of the
-- old strict owner-only `getOwnedTemplate`.
--
-- `published_at` is separate from the existing `updated_at` (which already changes on every edit,
-- unrelated to publish state) specifically so the Discover feed can sort by "when this was actually
-- shared," not "when its JSONB last changed for any reason" — set once, the moment `is_public` first
-- flips true; left untouched by an unpublish (so re-publishing later doesn't look like brand-new
-- content, and the value is still there if a future pass wants to distinguish "never published" from
-- "currently unpublished").

alter table templates add column if not exists is_public boolean not null default false;
alter table templates add column if not exists published_at timestamptz;

-- Partial index — only public rows are ever scanned by the Discover feed's own query, and a private
-- template (the overwhelming majority, expected) costs this index nothing to maintain.
create index if not exists templates_public_idx on templates (published_at desc) where is_public = true;

-- A SECOND, additive permissive policy for select — Postgres OR's every permissive policy for the same
-- command together, so this does not replace "Users can view their own templates" (0006), it just adds
-- a second way in. Every read here still goes through the server's own service-role client in
-- practice (same defense-in-depth reasoning 0006's own RLS comment already gives), but this keeps the
-- table's actual access rules correct and self-documenting regardless.
create policy "Anyone can view public templates"
  on templates for select
  using (is_public = true);
