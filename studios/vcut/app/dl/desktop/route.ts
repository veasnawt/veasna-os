/**
 * /dl/desktop — Public desktop installer redirect route.
 * Queries the public binary releases repository (veasnawt/vcut-releases) first,
 * falling back to the legacy repository (veasnawt/vcut) or the dedicated /download page.
 */

const PUBLIC_RELEASES_REPO = "veasnawt/vcut-releases";
const LEGACY_REPO = "veasnawt/vcut";

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  published_at: string;
  assets: { name: string; browser_download_url: string }[];
}

export const runtime = "nodejs";

async function fetchLatestWindowsInstaller(repo: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const releases = (await res.json()) as GitHubRelease[];
    if (!Array.isArray(releases) || releases.length === 0) return null;

    // Look for non-draft release with a .exe asset
    const valid = releases.find((r) => !r.draft && !r.prerelease);
    if (!valid) return null;

    const exe = valid.assets.find((a) => a.name.endsWith(".exe"));
    return exe ? exe.browser_download_url : valid.html_url;
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin;

  // 1. Try public releases distribution repo first
  const publicDownloadUrl = await fetchLatestWindowsInstaller(PUBLIC_RELEASES_REPO);
  if (publicDownloadUrl) {
    return Response.redirect(publicDownloadUrl, 302);
  }

  // 2. Try legacy repo
  const legacyDownloadUrl = await fetchLatestWindowsInstaller(LEGACY_REPO);
  if (legacyDownloadUrl) {
    return Response.redirect(legacyDownloadUrl, 302);
  }

  // 3. Fallback safely to our own /download landing page rather than a 404
  return Response.redirect(`${origin}/download`, 302);
}
