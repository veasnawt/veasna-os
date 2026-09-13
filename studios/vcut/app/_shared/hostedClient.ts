import { getAccessToken, getCachedAccessToken } from "@veasnawt/auth";

/** Shared by every dashboard-level page (`ProjectsDashboard.tsx`, and the Home/Templates/Me tabs built
 *  alongside it) that talks to `/api/vcut/*` directly rather than through `packages/vcut/src/api/
 *  client.ts` — that module covers an OPEN project's own editing operations, not "list/create/delete a
 *  project" or account-level concerns, which only ever lived in this app. One shared module now,
 *  rather than each page file re-declaring its own copy (which is exactly how this drifted before: see
 *  git history on `ProjectsDashboard.tsx` for the original inline versions of everything below). */
export const HOSTED = process.env.NEXT_PUBLIC_VCUT_HOSTED === "true";

export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!HOSTED) return fetch(input, init);
  const token = await getAccessToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
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
  const base = `/api/vcut/templates/${encodeURIComponent(templateId)}/preview`;
  if (!HOSTED) return base;
  const token = getCachedAccessToken();
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
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
}
