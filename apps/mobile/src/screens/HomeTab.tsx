import { useEffect, useState } from "react";
import { useSupabaseSession } from "@veasnawt/auth";
import {
  nativeListProjects,
  type LocalProjectSummary,
} from "@veasnawt/vcut/src/api/nativeStorage";
import {
  listDiscoverTemplates,
  templatePosterUrl,
  type TemplateRow,
} from "@veasnawt/vcut/src/api/templates";
import { NewProjectCard } from "@veasnawt/vcut/src/ui/NewProjectCard";
import {
  QuickTools,
  QuickToolProjectDialog,
  ToolArrow,
  type QuickTool,
} from "@veasnawt/vcut/src/ui/QuickTools";
import { formatUpdatedAt } from "../format";
import { ProjectThumbnail } from "../ProjectThumbnail";
import { NewProjectDialog } from "./NewProjectDialog";

export function HomeTab({
  onOpenProject,
  onOpenTemplates,
  onOpenProjects,
  onUseTemplate,
}: {
  onOpenProject: (id: string, name: string, tool?: QuickTool) => void;
  onOpenTemplates: () => void;
  onOpenProjects: () => void;
  onUseTemplate: (id: string) => void;
}) {
  const { user } = useSupabaseSession();
  const [projects, setProjects] = useState<LocalProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [tool, setTool] = useState<QuickTool | null>(null);
  const [safetyRevision, setSafetyRevision] = useState(0);
  useEffect(() => { const refresh = () => setSafetyRevision(value => value + 1); window.addEventListener("vcut-safety-changed", refresh); return () => window.removeEventListener("vcut-safety-changed", refresh); }, []);
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [templateError, setTemplateError] = useState(false);
  useEffect(() => {
    let active = true;
    nativeListProjects()
      .then((rows) => {
        if (active) setProjects(rows);
      })
      .catch(() => {
        if (active) setError("Couldn't load your projects.");
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    let active = true;
    setTemplates(null);
    setTemplateError(false);
    if (user)
      void listDiscoverTemplates()
        .then((rows) => {
          if (active)
            setTemplates(
              rows.filter((row) => row.previewReady !== false).slice(0, 4),
            );
        })
        .catch(() => {
          if (active) setTemplateError(true);
        });
    return () => {
      active = false;
    };
  }, [user, safetyRevision]);
  const sorted = projects
    ? [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
    : null;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300/80">
        Your creative space
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
        What will you create?
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-white/45">
        Start fresh, find inspiration, or jump into a quick tool.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-[1.3fr_1fr]">
        <NewProjectCard
          onClick={() => {
            setTool(null);
            setShowCreate(true);
          }}
        />
        <button
          onClick={onOpenTemplates}
          className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-left hover:border-violet-300/30"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            A little inspiration
          </span>
          <h2 className="mt-2 flex items-center gap-2 text-base font-semibold">
            Start with a template <ToolArrow />
          </h2>
          <p className="mt-1 text-xs text-white/45">
            Pick a style. Add your own moments.
          </p>
        </button>
      </div>
      <QuickTools onSelect={setTool} />
      <section className="mt-9" aria-labelledby="native-continue-heading">
        <div className="flex items-center justify-between">
          <h2
            id="native-continue-heading"
            className="text-sm font-semibold text-white/85"
          >
            Continue editing
          </h2>
          <button
            onClick={onOpenProjects}
            className="flex items-center gap-1 text-xs text-white/40"
          >
            All projects <ToolArrow />
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-xs text-amber-200/80">
            {error}
          </p>
        ) : sorted === null ? (
          <div
            className="mt-3 h-20 animate-pulse rounded-xl bg-white/5"
            aria-label="Loading projects"
          />
        ) : sorted.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/40">
            Create a project or try a template to start your next idea.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {sorted.slice(0, 3).map((project) => (
              <button
                key={project.id}
                onClick={() => onOpenProject(project.id, project.name)}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-2.5 text-left"
              >
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black">
                  <ProjectThumbnail
                    project={project}
                    className="h-full w-full"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">
                    {project.name}
                  </span>
                  <span className="mt-1 block text-[10px] text-white/35">
                    {formatUpdatedAt(project.updatedAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="mt-9" aria-labelledby="native-inspiration-heading">
        <div className="flex items-center justify-between">
          <h2
            id="native-inspiration-heading"
            className="text-sm font-semibold text-white/85"
          >
            Find your next idea
          </h2>
          <button
            onClick={onOpenTemplates}
            className="flex items-center gap-1 text-xs text-white/40"
          >
            Explore <ToolArrow />
          </button>
        </div>
        {!user || templateError ? (
          <button
            onClick={onOpenTemplates}
            className="mt-3 w-full rounded-xl border border-white/10 p-4 text-left text-xs text-white/50"
          >
            {!user
              ? "Sign in to explore creator templates."
              : "Explore more styles in Templates."}
          </button>
        ) : templates === null ? (
          <div className="mt-3 h-32 animate-pulse rounded-xl bg-white/5" />
        ) : templates.length === 0 ? (
          <p className="mt-3 text-xs text-white/40">
            New creator styles will appear here.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => onUseTemplate(template.id)}
                className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] text-left"
              >
                <img
                  src={templatePosterUrl(template.id)}
                  alt=""
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover"
                />
                <p className="truncate p-3 text-xs font-medium">
                  {template.name}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>
      {tool && !showCreate && (
        <QuickToolProjectDialog
          tool={tool}
          projects={sorted}
          error={error}
          onRetry={() => {
            setProjects(null);
            setError(null);
            setRetry((value) => value + 1);
          }}
          onClose={() => setTool(null)}
          onNew={() => setShowCreate(true)}
          onSelect={(project) => {
            onOpenProject(project.id, project.name, tool);
            setTool(null);
          }}
          renderThumbnail={(summary) => {
            const project = projects?.find((row) => row.id === summary.id);
            return project ? (
              <ProjectThumbnail project={project} className="h-full w-full" />
            ) : null;
          }}
        />
      )}
      {showCreate && (
        <NewProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            setShowCreate(false);
            onOpenProject(project.bpProjectId, project.name, tool ?? undefined);
            setTool(null);
          }}
        />
      )}
    </main>
  );
}
