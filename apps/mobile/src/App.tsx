import { VStudioApp } from "@veasna/vstudio";

// SCAFFOLD PLACEHOLDER — a single fixed local project id, persisted so dev reloads stay on the same
// project, standing in for the real native project list this app doesn't have yet (see the native
// iOS/Android plan's step 6: swapping client.ts's internals onto @capacitor/filesystem, which is what
// a real "create/open a project" screen needs). The editor itself won't be FUNCTIONAL against this id
// until that step lands — client.ts still only knows how to call the web app's /api/vstudio/* routes,
// which don't exist here. This file's only job right now is confirming the Capacitor+Vite shell
// actually builds and renders VStudioApp's UI at all.
const LOCAL_PROJECT_ID_KEY = "vstudio-mobile:scaffold-project-id";

function scaffoldProjectId(): string {
  let id = localStorage.getItem(LOCAL_PROJECT_ID_KEY);
  if (!id) {
    id = `local-${Date.now().toString(36)}`;
    localStorage.setItem(LOCAL_PROJECT_ID_KEY, id);
  }
  return id;
}

export default function App() {
  return <VStudioApp projectId={scaffoldProjectId()} projectName="Untitled" />;
}
