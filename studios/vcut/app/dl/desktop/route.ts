const REPO = "veasnawt/vcut";
/** The releases-list page itself — used whenever the GitHub API call fails, or nothing matching is
 *  found, so a broken lookup still lands someone somewhere useful rather than a dead end. */
const RELEASES_FALLBACK = `https://github.com/${REPO}/releases`;

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  published_at: string;
  assets: { name: string; browser_download_url: string }[];
}

export const runtime = "nodejs";

/** `/dl/desktop` — always redirects to the CURRENT latest desktop installer, resolved fresh from
 *  GitHub's own Releases API rather than a version number hardcoded into this page's own link (what
 *  the landing page did before this route existed, and the actual root cause of a real, confirmed bug:
 *  desktop and mobile releases both live in the SAME `veasnawt/vcut` repo — see `app/page.tsx`'s own
 *  former doc comment on why one repo, not two — so GitHub's own `/releases/latest` is just whichever
 *  of the two kinds was published most recently, not "latest desktop" specifically. A hardcoded tag
 *  fixed that ONE moment but reintroduces the identical staleness risk on every future desktop release
 *  — a string nothing checks against reality, easy to simply forget to bump.
 *
 *  Filters for the first non-draft, non-prerelease release whose tag starts with `vcut-desktop-` — the
 *  list is already returned newest-first by GitHub's API, so "first match" is "latest match," no manual
 *  date/semver comparison needed. Redirects straight to the `.exe` asset (a real download starts
 *  immediately) rather than the release's own page, which would need one more click.
 *
 *  The GitHub API call itself is cached for an hour (`next.revalidate`) — this route runs on every
 *  request (a redirect can't be pre-rendered), but that's a local, free lookup against Next's own data
 *  cache the rest of the time, not a live GitHub API call per visitor. GitHub's unauthenticated rate
 *  limit (60 req/hour) is per SOURCE IP, and every visitor's redirect is served from this one server's
 *  IP, not the visitor's own — without this, real traffic could exhaust that budget on its own. */
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return Response.redirect(RELEASES_FALLBACK, 302);
    const releases = (await res.json()) as GitHubRelease[];
    const latest = releases.find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith("vcut-desktop-"));
    if (!latest) return Response.redirect(RELEASES_FALLBACK, 302);
    const installer = latest.assets.find((a) => a.name.endsWith(".exe"));
    return Response.redirect(installer?.browser_download_url ?? latest.html_url, 302);
  } catch {
    return Response.redirect(RELEASES_FALLBACK, 302);
  }
}
