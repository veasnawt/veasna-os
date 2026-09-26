-- Tags on a saved template ("intro", "outro", "vlog", ...) — set once at save time
-- (`SaveAsTemplateDialog.tsx`), so a template can actually be found again later instead of scrolling a
-- long "My Templates"/"Discover" grid by eye. Free-form, not a fixed taxonomy: whatever words the
-- author typed, lowercased and deduped (`sanitizeTemplateTags` in `_lib/templates.ts` is the one place
-- that normalizes them, both here and on read).
--
-- `text[]`, not a join table — a template has a handful of short tags at most (capped client- and
-- server-side), read far more often than written, and never queried from any OTHER table's own angle
-- (nothing asks "every template tagged X" from a tags table first) — a normalized many-to-many would
-- buy nothing here that a plain array plus a GIN index doesn't already give.
alter table templates add column if not exists tags text[] not null default '{}'::text[];

-- Supports "does this template have ANY of these tags" (`tags && array[...]`) and "has this exact tag"
-- (`tags @> array['intro']`) without a full table scan — the shape the in-editor Template tool's own
-- tag-filter search and a future server-side tag search both need.
create index if not exists templates_tags_idx on templates using gin (tags);
