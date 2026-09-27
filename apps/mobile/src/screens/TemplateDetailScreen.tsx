import { useEffect, useState } from "react";
import { TemplateViewer } from "@veasnawt/vcut/src/ui/TemplateViewer";
import { centralAuthFetch, type TemplateRow } from "@veasnawt/vcut/src/api/dashboardClient";
import { listDiscoverTemplates } from "@veasnawt/vcut/src/api/templates";

export function TemplateDetailScreen({ templateId, templateIds, onBack, onUse }: {
  templateId: string; templateIds?: string[]; onBack: () => void; onUse: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    const load = async () => {
      const response = await centralAuthFetch(`/api/vcut/templates/${encodeURIComponent(templateId)}`);
      if (!response.ok) throw new Error("Couldn't open this template. Please retry.");
      const selected = await response.json() as TemplateRow;
      let rows: TemplateRow[];
      if (templateIds?.length) {
        const results = await Promise.allSettled(templateIds.map(async (id) => {
          if (id === templateId) return selected;
          const response = await centralAuthFetch(`/api/vcut/templates/${encodeURIComponent(id)}`);
          if (!response.ok) throw new Error("Template unavailable");
          return await response.json() as TemplateRow;
        }));
        rows = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      } else {
        rows = await listDiscoverTemplates().catch(() => []);
        if (!rows.some((row) => row.id === templateId)) rows.unshift(selected);
      }
      if (active) setTemplates(rows);
    };
    void load().catch((error: unknown) => { if (active) setError(error instanceof Error ? error.message : "Couldn't open templates"); });
    return () => { active = false; };
  }, [templateId, templateIds, retry]);
  return templates ? <TemplateViewer templates={templates} startIndex={Math.max(0, templates.findIndex((row) => row.id === templateId))} mode="discover" onClose={onBack}
    onDeleted={() => {}} onPublicChanged={() => {}} onUseTemplate={(template) => onUse(template.id)} /> :
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#0a0c10] p-6 text-white">
      <p role={error ? "alert" : "status"} className="text-sm text-white/70">{error ?? "Opening templates…"}</p>
      {error && <button className="rounded-lg bg-sky-500 px-4 py-2 text-sm" onClick={() => setRetry((value) => value + 1)}>Retry</button>}
      <button className="text-sm text-white/50" onClick={onBack}>Back</button>
    </div>;
}