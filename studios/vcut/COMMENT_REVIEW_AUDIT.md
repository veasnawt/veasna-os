# Existing comment and project-review audit

## Existing comment features

VCut has public-template comments in `template_comments` (migration
`0010_templates_social.sql`). The Discover viewer and `/t/[id]` share page list,
post and show them; the viewer can delete a comment. They are flat text rows,
shown oldest first with batched public display names. The existing routes are
`/api/vcut/templates/[id]/comments` and its `[commentId]` child. Public templates
can be read without signing in; writing requires a verified Supabase session.
No project review comment panel exists in the editor.

## Data, realtime, UI and permissions

`template_comments` has `id`, non-null `template_id`, `user_id`, `body` and
`created_at`. Its RLS lets anyone read rows on public templates and an
authenticated user insert their own row there. The route uses the service-role
client and allows an author or template owner to delete. Profile names are
fetched in one extra batch query; avatar assets are already available through
the public creator-avatar endpoint. There are no reply, edit, timestamp,
resolution or mention columns. Existing UIs append posts immediately from the
POST response, fetch once on open, and have no realtime subscription. There is
no notification infrastructure to reuse.

Hosted projects are indexed by `projects_index` and every project API checks
owner identity before touching server files. Native/local projects live on the
device; uploaded cloud projects get a separate hosted ID through the existing
sync link. No reviewer/collaborator permission exists today. Thus neither a
second user nor a native-only local project can currently use server-side
project review by project ID. Simply exposing comment routes or project files
by an opaque ID would bypass the existing ownership boundary.

## Gaps and implementation direction

Extend `template_comments` in place, preserving every existing row and API,
with one-level replies, optional numerical timeline time, edit/tombstone and
resolution metadata. Scope each row to exactly one template or hosted project.
Keep service routes as the enforcement path and add RLS for private project
access. Introduce explicit review-only project membership for invited signed-in
users rather than broadening the owner gate for editing routes. The editor can
use the existing playhead and ruler coordinates for time navigation and markers.
Use one Supabase Realtime subscription per open project editor/review page with
ID-based upsert/deduplication and refetch on reconnect; do not build a parallel
comment store. Native/desktop review requires an uploaded cloud copy and resolves its
hosted ID through the existing sync link. Mentions may suggest only the owner
and invited reviewers. Notification delivery is deferred because no current
infrastructure exists; comment events can carry the necessary author/project
IDs for a later notification worker.

The existing template view remains public. The implemented private review page
uses the editor's existing preview engine but hides editing controls; its project
JSON and referenced media are the only existing project routes granted to an
invited reviewer. All saves, exports and other editor operations stay owner-only.
The review routes check membership on every request, and the Realtime SELECT
policy also checks project membership and blocks. There is no general team
workspace or notification delivery service to integrate yet.
