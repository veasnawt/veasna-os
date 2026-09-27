import { useEffect, useState } from "react";
import { getSupabaseBrowserClient, useSupabaseSession } from "@veasnawt/auth";
import { startCloudSync } from "@veasnawt/vcut/src/api/cloudProjects";
import { TemplateDraftApp, VCutApp } from "@veasnawt/vcut";
import { subscribeToNativeAuthCallback } from "@veasnawt/vcut/src/api/nativeAuth";
import { TabBar, TabBarSpacer, type TabId } from "./TabBar";
import { HomeTab } from "./screens/HomeTab";
import { ProjectsTab } from "./screens/ProjectsTab";
import { TemplatesTab } from "./screens/TemplatesTab";
import type { QuickTool } from "@veasnawt/vcut/src/ui/QuickTools";
import { MeTab } from "./screens/MeTab";
import { TemplateDetailScreen } from "./screens/TemplateDetailScreen";
import { installKeyboardViewport } from "./keyboardViewport";

type View =
  | { kind: "tabs"; tab: TabId }
  | { kind: "editor"; projectId: string; projectName?: string; initialTool?: QuickTool }
  | { kind: "templatePreview"; templateId: string; templateIds?: string[]; returnTab: TabId }
  | { kind: "templateDraft"; templateId: string; templateIds?: string[]; returnTab: TabId };

/** The real Home/Projects/Templates/Me shell this app never had — see the scaffold this replaces
 *  (previously: one hardcoded local project, no list, no way back to it). `VCutApp`'s own `onHome` prop
 *  (already built, previously unused by this app — see its own doc comment in `VCutApp.tsx`) is what
 *  lets the editor hand control back to this shell instead of being the app's only screen. */
export default function App() {
  useEffect(installKeyboardViewport, []);
  const { user } = useSupabaseSession();
  useEffect(() => { if (user) return startCloudSync(); }, [user?.id]);
  const [view, setView] = useState<View>({ kind: "tabs", tab: "home" });

  // `VCutApp.tsx` has this exact same effect, but only while it's actually mounted (a project open) —
  // fine before this shell existed, since `VCutApp` WAS the whole app. Now that "Me"/"Templates" can
  // open `MobileSignInDialog` from the tab shell, with no project open at all, the browser round trip
  // (Google, or an emailed link) has nothing listening for the `vcut://auth-callback` it comes back
  // through unless this is ALSO subscribed here — a real, reported bug otherwise: sign-in would appear
  // to hand off to the browser fine, then silently do nothing on return. Harmless if VCutApp's own copy
  // ALSO happens to be active (a project open) at the same moment — both just call the same idempotent
  // `setSession` with the same tokens.
  useEffect(() => {
    return subscribeToNativeAuthCallback(({ accessToken, refreshToken }) => {
      void getSupabaseBrowserClient()?.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    });
  }, []);

  function openProject(projectId: string, projectName: string, initialTool?: QuickTool) {
    setView({ kind: "editor", projectId, projectName, initialTool });
  }
  function goHome() {
    setView({ kind: "tabs", tab: "home" });
  }
  function previewTemplate(templateId: string, templateIds?: string[]) {
    setView({ kind: "templatePreview", templateId, templateIds, returnTab: view.kind === "tabs" ? view.tab : "templates" });
  }

  if (view.kind === "editor") {
    return <VCutApp projectId={view.projectId} projectName={view.projectName} onHome={goHome} initialTool={view.initialTool} />;
  }

  if (view.kind === "templatePreview") {
    return <TemplateDetailScreen key={view.templateId} templateId={view.templateId} templateIds={view.templateIds}
      onBack={() => setView({ kind: "tabs", tab: view.returnTab })}
      onUse={(templateId) => setView({ kind: "templateDraft", templateId, templateIds: view.templateIds, returnTab: view.returnTab })} />;
  }

  if (view.kind === "templateDraft") {
    return (
      <div className="h-dvh">
        <TemplateDraftApp templateId={view.templateId} onHome={() => setView({ kind: "templatePreview", templateId: view.templateId, templateIds: view.templateIds, returnTab: view.returnTab })} onProjectCreated={openProject} />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-[#0a0c10] text-white">
      <TabBarSpacer>
        {view.tab === "home" && (
          <HomeTab onOpenProject={openProject} onOpenTemplates={() => setView({ kind: "tabs", tab: "templates" })} onOpenProjects={() => setView({ kind: "tabs", tab: "projects" })} onUseTemplate={previewTemplate} />
        )}
        {view.tab === "projects" && <ProjectsTab onOpenProject={openProject} />}
        {view.tab === "templates" && <TemplatesTab onUseTemplate={previewTemplate} />}
        {view.tab === "me" && <MeTab onOpenTemplate={previewTemplate} />}
      </TabBarSpacer>
      <TabBar active={view.tab} onChange={(tab) => setView({ kind: "tabs", tab })} />
    </div>
  );
}
