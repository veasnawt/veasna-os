import { ProjectsDashboard } from "../../ProjectsDashboard";

/** The exhaustive project list — the "Projects" tab. Auth-gating lives in `(tabs)/layout.tsx` now,
 *  shared across every tab rather than re-checked here. */
export default function ProjectsPage() {
  return <ProjectsDashboard />;
}
