export const HOSTED_VCUT_URL = "https://vcut.io";

export interface VCutIntegration {
  url: string;
  mode: "external" | "local";
  invalidConfiguration: boolean;
}

/** Configuration is a launch destination, never a server-side fetch target. */
export function resolveVCutIntegration(configured?: string): VCutIntegration {
  const fallback: VCutIntegration = {
    url: HOSTED_VCUT_URL,
    mode: "external",
    invalidConfiguration: false,
  };
  if (!configured?.trim()) return fallback;
  try {
    const url = new URL(configured.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
      return { ...fallback, invalidConfiguration: true };
    }
    return {
      url: url.href.replace(/\/$/, ""),
      mode: local ? "local" : "external",
      invalidConfiguration: false,
    };
  } catch {
    return { ...fallback, invalidConfiguration: true };
  }
}

export function vcutProjectUrl(integration: VCutIntegration, id: string, name: string): string {
  // Only an explicitly configured loopback editor supports BP's local project handoff.
  // Hosted accounts have separate storage; never send BP titles or identifiers there.
  if (integration.mode !== "local") return integration.url;
  const query = new URLSearchParams({ projectId: id, projectName: name });
  return `${integration.url}/edit?${query}`;
}

/** The desktop guest may launch only the configured editor or the hosted fallback. */
export function isVCutLaunchUrl(candidate: string, configured?: string): boolean {
  const integration = resolveVCutIntegration(configured);
  try {
    const url = new URL(candidate);
    if (url.username || url.password || url.hash) return false;
    if (url.href === new URL(HOSTED_VCUT_URL).href || url.href === new URL(integration.url).href) return true;
    const edit = new URL(integration.url + "/edit");
    return integration.mode === "local" && url.origin === edit.origin && url.pathname === edit.pathname &&
      [...url.searchParams.keys()].every(key => key === "projectId" || key === "projectName");
  } catch {
    return false;
  }
}
