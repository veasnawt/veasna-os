import type { WebContents } from "electron";
import { isVCutLaunchUrl } from "@veasnawt/integrations";

/** Always deny guest windows; validated BP editor links go to the OS browser. */
export function installVCutGuestLinks(
  contents: WebContents,
  bpUrl: () => string,
  openExternal: (url: string) => Promise<void>,
  configured?: string,
) {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(contents.getURL()).origin === new URL(bpUrl()).origin && isVCutLaunchUrl(url, configured)) {
        void openExternal(url).catch(() => console.error("Could not open VCut in the external browser"));
      }
    } catch {
      // A malformed or untrusted guest URL never opens an external application.
    }
    return { action: "deny" };
  });
}
