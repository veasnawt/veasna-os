"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video } from "@veasnawt/vicons";
import type { Project } from "@veasnawt/vcut/src/project/types";
import {
  authFetch,
  centralAuthFetch,
  displayNameOrFallback,
  formatUpdatedAt,
  templatePosterUrl,
  thumbnailUrl,
  type ProjectSummary,
  type TemplateRow,
} from "../../_shared/hostedClient";
import { NewProjectDialog } from "../../ProjectsDashboard";
import { NewProjectCard } from "@veasnawt/vcut/src/ui/NewProjectCard";
import {
  QuickTools,
  QuickToolProjectDialog,
  ToolArrow,
  type QuickTool,
} from "@veasnawt/vcut/src/ui/QuickTools";

function editorUrl(
  project: Pick<ProjectSummary, "id" | "name">,
  tool?: QuickTool | null,
) {
  const params = new URLSearchParams({
    projectId: project.id,
    projectName: project.name,
  });
  if (tool) params.set("tool", tool);
  return `/edit?${params}`;
}

/** Home starts a creative task; Projects remains the complete library. */
export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [templateError, setTemplateError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [projectsRetry, setProjectsRetry] = useState(0);
  useEffect(() => { const refresh = () => setProjectsRetry(value => value + 1); window.addEventListener("vcut-safety-changed", refresh); return () => window.removeEventListener("vcut-safety-changed", refresh); }, []);
  const [quickTool, setQuickTool] = useState<QuickTool | null>(null);

  useEffect(() => {
    let active = true;
    authFetch("/api/vcut/projects")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            body?.error ?? `Couldn't load your projects (${res.status}).`,
          );
        }
        return res.json() as Promise<{ projects: ProjectSummary[] }>;
      })
      .then((body) => {
        if (active) setProjects(body.projects);
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Couldn't load your projects.",
          );
      });
    centralAuthFetch("/api/vcut/templates/discover")
      .then(async (res) => {
        if (!res.ok) throw new Error("Templates unavailable");
        return res.json() as Promise<{ templates: TemplateRow[] }>;
      })
      .then((body) => {
        if (active)
          setTemplates(
            body.templates.filter((t) => t.previewReady !== false).slice(0, 4),
          );
      })
      .catch(() => {
        if (active) setTemplateError(true);
      });
    return () => {
      active = false;
    };
  }, [projectsRetry]);

  const sortedProjects = projects
    ? [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
    : null;
  const recent = sortedProjects?.slice(0, 3);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300/80">
        Your creative space
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        What will you create?
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-white/45">
        Start fresh, find inspiration, or jump into a quick tool.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-[1.3fr_1fr]">
        <NewProjectCard
          onClick={() => {
            setQuickTool(null);
            setShowCreate(true);
          }}
        />
        <Link
          href="/templates"
          className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:border-violet-300/30 hover:bg-violet-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:p-6"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            A little inspiration
          </span>
          <h2 className="mt-2 text-base font-semibold text-white">
            Start with a template{" "}
            <span aria-hidden="true" className="inline-flex align-middle">
              <ToolArrow />
            </span>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-white/45">
            Pick a style. Add your own moments.
          </p>
        </Link>
      </div>

      <QuickTools onSelect={setQuickTool} />

      <section className="mt-9" aria-labelledby="continue-heading">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="continue-heading"
            className="text-sm font-semibold text-white/85"
          >
            Continue editing
          </h2>
          <Link
            href="/projects"
            className="text-xs text-white/40 transition hover:text-white"
          >
            All projects{" "}
            <span aria-hidden="true" className="inline-flex align-middle">
              <ToolArrow />
            </span>
          </Link>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-xs text-amber-200/80">
            {error}
          </p>
        ) : recent === undefined ? (
          <div
            className="mt-3 grid gap-2 sm:grid-cols-3"
            aria-label="Loading recent projects"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-white/[0.04] motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-white/10 p-4 text-xs leading-relaxed text-white/40">
            Your next idea starts here. Create a project or try a template
            above.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {recent.map((project) => (
              <ProjectShortcut
                key={project.id}
                project={project}
                href={editorUrl(project)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-9" aria-labelledby="inspiration-heading">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="inspiration-heading"
            className="text-sm font-semibold text-white/85"
          >
            Find your next idea
          </h2>
          <Link
            href="/templates"
            className="text-xs text-white/40 transition hover:text-white"
          >
            Explore{" "}
            <span aria-hidden="true" className="inline-flex align-middle">
              <ToolArrow />
            </span>
          </Link>
        </div>
        {templateError ? (
          <p className="mt-3 text-xs leading-relaxed text-white/40">
            Visit Templates to explore creator styles.
          </p>
        ) : templates === null ? (
          <div
            className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"
            aria-label="Loading templates"
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-xl bg-white/[0.04] motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <Link
            href="/templates"
            className="mt-3 block rounded-xl border border-white/10 p-4 text-xs text-white/50 hover:text-white"
          >
            Discover styles in Templates{" "}
            <span aria-hidden="true" className="inline-flex align-middle">
              <ToolArrow />
            </span>
          </Link>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {templates.map((template) => (
              <Link
                key={template.id}
                href={`/edit?templateId=${encodeURIComponent(template.id)}`}
                className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] transition hover:border-white/25"
              >
                <div className="aspect-[3/4] overflow-hidden bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={templatePosterUrl(template.id)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none"
                  />
                </div>
                <div className="p-3">
                  <p className="truncate text-xs font-medium text-white/85">
                    {template.name}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-white/35">
                    {displayNameOrFallback(template.creatorDisplayName)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {quickTool && !showCreate && (
        <QuickToolProjectDialog
          tool={quickTool}
          projects={sortedProjects}
          error={error}
          onClose={() => setQuickTool(null)}
          onNew={() => setShowCreate(true)}
          onRetry={() => {
            setError(null);
            setProjects(null);
            setProjectsRetry((value) => value + 1);
          }}
          onSelect={(project) => {
            router.push(editorUrl(project, quickTool));
            setQuickTool(null);
          }}
        />
      )}
      {showCreate && (
        <NewProjectDialog
          onClose={() => setShowCreate(false)}
          onCreated={(project: Project) => {
            setShowCreate(false);
            router.push(
              editorUrl(
                { id: project.bpProjectId, name: project.name },
                quickTool,
              ),
            );
            setQuickTool(null);
          }}
        />
      )}
    </main>
  );
}

function ProjectShortcut({
  project,
  href,
}: {
  project: ProjectSummary;
  href: string;
}) {
  const poster = thumbnailUrl(project.id, project.thumbnail);
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-2.5 transition hover:border-white/25 hover:bg-white/[0.04]"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black text-white/20">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="h-full w-full object-contain" />
        ) : (
          <Video size={20} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-white/85">
          {project.name}
        </span>
        <span className="mt-1 block text-[10px] text-white/35">
          {formatUpdatedAt(project.updatedAt)}
        </span>
      </span>
    </Link>
  );
}
