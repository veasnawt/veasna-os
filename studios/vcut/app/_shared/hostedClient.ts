import { getAccessToken, getCachedAccessToken } from "@veasnawt/auth";

/** Shared by every dashboard-level page (`ProjectsDashboard.tsx`, and the Home/Templates/Me tabs built
 *  alongside it) that talks to `/api/vcut/*` directly rather than through `packages/vcut/src/api/
 *  client.ts` — that module covers an OPEN project's own editing operations, not "list/create/delete a
 *  project" or account-level concerns, which only ever lived in this app. One shared module now,
 *  rather than each page file re-declaring its own copy (which is exactly how this drifted before: see
 *  git history on `ProjectsDashboard.tsx` for the original inline versions of everything below). */
export const HOSTED = process.env.NEXT_PUBLIC_VCUT_HOSTED === "true";

/** Same 401-retry `packages/vcut/src/api/client.ts`'s own `apiFetch` already has — copied here rather
 *  than shared code across the package boundary (see this file's own top comment on why dashboard-level
 *  pages stay independent of that package). A 401 isn't necessarily a genuinely dead session — it can
 *  also be a stale-but-still-refreshable access token (e.g. right after this tab sat backgrounded for a
 *  while — Supabase's own auto-refresh ticker pauses while hidden). `getAccessToken()` re-checks real
 *  expiry and refreshes through Supabase's own logic if the refresh token is still valid; one retry
 *  with whatever that returns costs nothing when the session really IS dead, but silently recovers the
 *  far more common case where it wasn't, instead of surfacing "session expired" to someone who was
 *  still actively using the app moments earlier. This file's own copy had drifted behind `apiFetch`'s
 *  — missing this exact fix — until now; a real, reported gap, not theoretical. */
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!HOSTED) return fetch(input, init);
  const token = await getAccessToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status !== 401) return response;
  const freshToken = await getAccessToken();
  if (!freshToken || freshToken === token) return response;
  const retryHeaders = new Headers(init?.headers);
  retryHeaders.set("Authorization", `Bearer ${freshToken}`);
  return fetch(input, { ...init, headers: retryHeaders });
}

/** `authFetch`'s counterpart for the templates routes specifically — those are `hostedOnlyRoute` on
 *  the SERVER regardless of who's calling (see `_lib/localOnly.ts`'s own doc comment: templates only
 *  ever live on the one live vcut.io deployment, there's no local/desktop concept of a saved template),
 *  so unlike every other call in this file, a relative `!HOSTED` request would always 404 rather than
 *  correctly hitting "nothing local to protect." Same fix `packages/vcut/src/api/client.ts`'s own
 *  `centralFetch` and `billing.ts`'s `billingFetch` already got for the identical reason (Stock/
 *  Stickers/AI-generation/billing) — always attach the token, and go straight to the live deployment
 *  when this build isn't it. Confirmed as a real, reported gap: turning on desktop's own tab bar
 *  surfaced "Not available outside the hosted web deployment." on its Templates tab, not a 404 that
 *  silently degraded to an empty list. */
export async function centralAuthFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const url = HOSTED ? input : `https://vcut.io${input}`;
  return fetch(url, { ...init, headers });
}

/** `centralAuthFetch`'s `<video src>`/`<img src>` counterpart — for the same class of route (a
 *  template's own preview/poster, which — like the routes `centralAuthFetch` covers — only ever lives
 *  on the hosted deployment). A plain `src` attribute can't attach an `Authorization` header, so this
 *  appends the cached token as `?token=` instead (same fallback `thumbnailUrl` above already uses for
 *  project-scoped media, just also routed to the live deployment when `!HOSTED` rather than staying
 *  relative — templates have no local/desktop copy for a relative URL to correctly point at). */
function centralAssetUrl(base: string): string {
  const token = getCachedAccessToken();
  const withToken = token ? `${base}?token=${encodeURIComponent(token)}` : base;
  return HOSTED ? withToken : `https://vcut.io${withToken}`;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clipCount: number;
  width: number;
  height: number;
  thumbnail?: { relPath: string; kind: "thumbnail" | "media"; library: boolean };
}

/** Same `media/raw` route `packages/vcut/src/api/client.ts`'s own `mediaUrl` builds a URL for — this
 *  app duplicates the URL-building rather than importing that helper (see this file's own top-level
 *  doc comment on why), so it also had to duplicate the SAME fix: an `<img src>` here is a plain
 *  browser resource load, unable to attach `apiFetch`'s `Authorization` header — needs the session
 *  token riding along as `?token=` instead, same fallback `_lib/auth.ts`'s `requireSessionUser`
 *  already accepts. Confirmed as a real gap, not theoretical: every project card's thumbnail 401'd on
 *  the real vcut.io deploy before this existed, the exact same failure `mediaUrl`'s own fix already
 *  covered inside the open editor. */
export function thumbnailUrl(projectId: string, thumbnail: ProjectSummary["thumbnail"]): string | undefined {
  if (!thumbnail) return undefined;
  const libraryParam = thumbnail.library ? "&library=1" : "";
  const base = `/api/vcut/media/raw?projectId=${encodeURIComponent(projectId)}&relPath=${encodeURIComponent(thumbnail.relPath)}&kind=${thumbnail.kind}${libraryParam}`;
  if (!HOSTED) return base;
  const token = getCachedAccessToken();
  return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}

/** URL for one saved template's own preview clip (`renderTemplatePreview`'s output, server-side) —
 *  same `?token=` fallback as `thumbnailUrl` above, for the identical "a plain `<video src>` can't
 *  attach an Authorization header" reason. A missing preview (an older template saved before this
 *  existed, or a best-effort render that failed) 404s with `template-preview-missing` — callers show
 *  a generic placeholder tile rather than a broken video in that case, same as `AssetThumbnail`'s own
 *  handling of an asset with no thumbnail. */
export function templatePreviewUrl(templateId: string): string {
  return centralAssetUrl(`/api/vcut/templates/${encodeURIComponent(templateId)}/preview`);
}

/** A real still frame for the grid tile's own `<video poster=...>` — see `poster/route.ts`'s own doc
 *  comment for why relying on the browser's default first-frame decode (what this tile used to do,
 *  with no `poster` attribute at all) doesn't reliably work. Same `?token=` hosted-mode fallback as
 *  `templatePreviewUrl` above, for the identical reason. */
export function templatePosterUrl(templateId: string): string {
  return centralAssetUrl(`/api/vcut/templates/${encodeURIComponent(templateId)}/poster`);
}

/** The full-screen swipe viewer's own source — `renderTemplatePreview`'s `preview-full.mp4`, the
 *  template's real full duration at its own real export quality, NOT the short low-bitrate loop
 *  `templatePreviewUrl` serves for the grid tile's background. Same `?token=` hosted-mode fallback. */
export function templateFullPreviewUrl(templateId: string): string {
  return centralAssetUrl(`/api/vcut/templates/${encodeURIComponent(templateId)}/preview-full`);
}

/** A small, fixed palette (not an arbitrary HSL-from-hash) — picking from real, pre-tuned colors avoids
 *  the muddy/illegible combinations a raw hash-to-hue formula can land on (a pale yellow on white text,
 *  for instance), the actual reason Phase 3's own scoping picked "auto-generated, no upload" avatars in
 *  the first place (skips needing any new storage at all — see migration 0010's own comment on
 *  `display_name`) without looking cheap. */
const AVATAR_COLORS = ["#f97316", "#ef4444", "#ec4899", "#a855f7", "#6366f1", "#0ea5e9", "#14b8a6", "#22c55e", "#84cc16", "#eab308"];

/** Deterministic per-user color — the SAME `seed` (a user id) always picks the same color, so one
 *  creator's initial looks consistent everywhere it appears (Discover tiles, the viewer's action rail,
 *  `/u/[id]`), without storing a color anywhere. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** The single letter shown in a generated avatar — the display name's own first letter when set,
 *  otherwise a generic fallback (never a raw user id fragment, which would look like a bug rather than
 *  a deliberate placeholder). */
export function avatarInitial(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed[0].toUpperCase() : "V";
}

/** What Discover tiles/the viewer show under a creator's name when they've never set one — never a raw
 *  user id, which would read as a bug rather than "this person hasn't customized their profile yet". */
export function displayNameOrFallback(displayName: string | null | undefined): string {
  return displayName?.trim() || "A VCut creator";
}

/** One row from `GET /api/vcut/templates/[id]/comments` — the full-screen viewer's own Comments panel
 *  and the public `/t/[id]` share page both render the same shape. */
export interface CommentRow {
  id: string;
  templateId: string;
  userId: string;
  authorDisplayName: string | null;
  body: string;
  createdAt: string;
}

export function formatUpdatedAt(ms: number): string {
  const diffMinutes = Math.round((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(ms).toLocaleDateString();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One row from `GET /api/vcut/templates` — deliberately just `{id, name, updatedAt}`, not the full
 *  `TemplateProjectData` (tracks/assets) that route also stores: the Templates tab's own grid/viewer
 *  (`templates/page.tsx`, `TemplateViewer.tsx`) never needs a template's internal structure, only
 *  enough to list/preview/delete/start-a-project-from it — `templatePreviewUrl(id)` covers the visual
 *  half without needing anything from `project` at all. */
export interface TemplateRow {
  id: string;
  name: string;
  updatedAt: string;
  /** Phase 2's opt-in public sharing — see the `is_public` column's own migration comment. Always
   *  `false` for a row from the "Discover" feed's own perspective doesn't matter (Discover already
   *  only ever returns public rows, `listPublicTemplates` excludes your own) — this field's real job
   *  is telling "My Templates" which of YOUR OWN templates are currently published, so the grid/viewer
   *  can show the right toggle state. */
  isPublic: boolean;
  ownerId: string;
  /** Set only for a template that repeats AI tools on the user's media: the estimated credits one use costs. Pro-only. */
  aiCredits?: number;
  /** The four fields below only ever come from `GET /api/vcut/templates/discover` (batched there — see
   *  that route's own doc comment) — a "My Templates" row never carries them (`undefined`), since
   *  `TemplateViewer.tsx`'s own action rail only shows Like/Comment counts in `mode === "discover"`
   *  anyway. Optional rather than a second, near-duplicate interface — keeping ONE `TemplateRow` shape
   *  both feeds return avoids a `DiscoverTemplateRow` that would need its own plumbing through
   *  `TemplateViewer`/`TemplateGridTile` for what's really the same row with a few extra properties. */
  creatorDisplayName?: string | null;
  likeCount?: number;
  commentCount?: number;
  viewerHasLiked?: boolean;
}
