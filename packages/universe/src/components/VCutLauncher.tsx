import { useEffect, useState } from "react";
import { HOSTED_VCUT_URL, resolveVCutIntegration } from "@veasnawt/integrations";

export default function VCutLauncher() {
  const [integration, setIntegration] = useState(() => resolveVCutIntegration());
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/vcut-url", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Configuration unavailable");
        return response.json();
      })
      .then((body: { url?: unknown }) => {
        if (typeof body.url === "string") setIntegration(resolveVCutIntegration(body.url));
      })
      .catch(() => { /* The hosted launch remains available when configuration is unavailable. */ });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-[#0b0e14] p-8 text-center text-slate-200">
      <h2 className="text-2xl font-semibold">VCut</h2>
      <p className="max-w-md text-sm text-slate-400">Edit your videos in VCut. The editor opens separately and keeps its own projects and account.</p>
      <a href={integration.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-sky-500 px-5 py-3 text-sm font-medium text-white">
        {integration.mode === "local" ? "Open local VCut" : "Open VCut"}
      </a>
      {integration.mode === "local" && <p className="max-w-md text-xs text-slate-400">Start your separately installed VCut server first. If it is unavailable, <a href={HOSTED_VCUT_URL} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">open VCut online</a>.</p>}
    </div>
  );
}
