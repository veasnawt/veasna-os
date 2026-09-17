import type { ReactNode } from "react";

// Rendered per request, not prerendered as a static page. As a static page, `/edit` let the client
// router reuse a PREFETCHED copy — made for one project's link (e.g. a recent project on the Home tab)
// — when navigating to a different `?projectId=`, and it rewrote the URL back to that prefetched
// project's. Reported as "creating a blank project opens a previous project with its video": the new
// project was created empty on the server, but the editor loaded the recent project instead.
export const dynamic = "force-dynamic";

export default function EditLayout({ children }: { children: ReactNode }) {
  return children;
}
