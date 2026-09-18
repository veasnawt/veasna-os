import { useState } from "react";
import { TemplateDraftApp, VCutApp } from "@veasnawt/vcut";
import { TabBar, TabBarSpacer, type TabId } from "./TabBar";
import { HomeTab } from "./screens/HomeTab";
import { ProjectsTab } from "./screens/ProjectsTab";
import { TemplatesTab } from "./screens/TemplatesTab";
import { MeTab } from "./screens/MeTab";

type View =
  | { kind: "tabs"; tab: TabId }
  | { kind: "editor"; projectId: string; projectName?: string }
  | { kind: "templateDraft"; templateId: string };

/** The real Home/Projects/Templates/Me shell this app never had — see the scaffold this replaces
 *  (previously: one hardcoded local project, no list, no way back to it). `VCutApp`'s own `onHome` prop
 *  (already built, previously unused by this app — see its own doc comment in `VCutApp.tsx`) is what
 *  lets the editor hand control back to this shell instead of being the app's only screen. */
export default function App() {
  const [view, setView] = useState<View>({ kind: "tabs", tab: "home" });

  function openProject(projectId: string, projectName: string) {
    setView({ kind: "editor", projectId, projectName });
  }
  function goHome() {
    setView({ kind: "tabs", tab: "home" });
  }

  if (view.kind === "editor") {
    return <VCutApp projectId={view.projectId} projectName={view.projectName} onHome={goHome} />;
  }

  if (view.kind === "templateDraft") {
    return (
      <div className="h-dvh">
        <TemplateDraftApp templateId={view.templateId} onHome={goHome} onProjectCreated={openProject} />
      </div>
    );
  }

  return (
    <div className="bg-[#0a0c10] text-white">
      <TabBarSpacer>
        {view.tab === "home" && (
          <HomeTab onOpenProject={openProject} onOpenTemplates={() => setView({ kind: "tabs", tab: "templates" })} />
        )}
        {view.tab === "projects" && <ProjectsTab onOpenProject={openProject} />}
        {view.tab === "templates" && <TemplatesTab onUseTemplate={(templateId) => setView({ kind: "templateDraft", templateId })} />}
        {view.tab === "me" && <MeTab />}
      </TabBarSpacer>
      <TabBar active={view.tab} onChange={(tab) => setView({ kind: "tabs", tab })} />
    </div>
  );
}
