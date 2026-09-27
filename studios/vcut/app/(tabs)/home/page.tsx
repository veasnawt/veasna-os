"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Close, Microphone, Music, Text, Video } from "@veasnawt/vicons";
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

type QuickTool = "captions" | "music" | "voiceover";
const quickTools = [
  {
    id: "captions",
    label: "Auto captions",
    description: "Make every word easy to follow.",
    action: "Add captions",
    prompt: "Which video needs captions?",
    hint: "Choose a project, then select the speech you want to caption.",
    accent: "hover:border-sky-300/40 hover:bg-sky-400/[0.06]",
    preview: "Words that stay with you",
    icon: Text,
    color: "text-sky-300 bg-sky-400/10",
  },
  {
    id: "music",
    label: "Music",
    description: "Give your story a soundtrack.",
    action: "Browse music",
    prompt: "Find the sound for your story",
    hint: "Choose a project to browse music and add it to your timeline.",
    accent: "hover:border-violet-300/40 hover:bg-violet-400/[0.06]",
    preview: "Find your rhythm",
    icon: Music,
    color: "text-violet-300 bg-violet-400/10",
  },
  {
    id: "voiceover",
    label: "Voiceover",
    description: "Tell it in your own voice.",
    action: "Record voiceover",
    prompt: "Bring your story to life",
    hint: "Choose a project, then record a voiceover in the editor.",
    accent: "hover:border-rose-300/40 hover:bg-rose-400/[0.06]",
    preview: "Your voice. Your story.",
    icon: Microphone,
    color: "text-rose-300 bg-rose-400/10",
  },
] as const;

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
        <button
          onClick={() => {
            setQuickTool(null);
            setShowCreate(true);
          }}
          className="group relative overflow-hidden rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-500/20 via-sky-500/10 to-violet-500/15 p-5 text-left transition hover:border-sky-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:p-6"
        >
          <div className="flex items-center gap-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-400 text-3xl font-light text-[#081019]"
              aria-hidden="true"
            >
              +
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                New project
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-white/50">
                Bring a video or photo. Make it yours.
              </p>
            </div>
          </div>
        </button>
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

      <section className="mt-8" aria-labelledby="quick-tools-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="quick-tools-heading"
            className="text-sm font-semibold text-white/85"
          >
            Quick tools
          </h2>
          <p className="text-xs text-white/40">
            A little polish goes a long way.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {quickTools.map(
            ({
              id,
              label,
              description,
              icon: Icon,
              color,
              accent,
              preview,
              action,
            }) => (
              <button
                key={id}
                onClick={() => setQuickTool(id)}
                aria-haspopup="dialog"
                className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 motion-reduce:transition-none sm:block sm:p-5 ${accent}`}
              >
                <div
                  aria-hidden="true"
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:mb-5 sm:h-24 sm:w-full ${color}`}
                >
                  <Icon size={24} />
                  <span className="ml-3 hidden text-xs font-medium sm:inline">
                    {preview}
                  </span>
                  <span className="pointer-events-none absolute -right-6 -top-8 hidden h-28 w-28 rounded-full border border-current opacity-10 sm:block" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">
                    {label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-white/50">
                    {description}
                  </span>
                  <span className="mt-4 hidden items-center gap-2 text-xs font-medium text-white/75 group-hover:text-white sm:flex">
                    {action}
                    <ToolArrow />
                  </span>
                </div>
                <span
                  className="text-white/40 group-hover:text-white sm:hidden"
                  aria-hidden="true"
                >
                  <ToolArrow />
                </span>
              </button>
            ),
          )}
        </div>
      </section>

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

function ToolArrow() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QuickToolProjectDialog({
  tool,
  projects,
  error,
  onClose,
  onNew,
  onSelect,
  onRetry,
}: {
  tool: QuickTool;
  projects: ProjectSummary[] | null;
  error: string | null;
  onClose: () => void;
  onNew: () => void;
  onSelect: (project: ProjectSummary) => void;
  onRetry: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const config = quickTools.find((item) => item.id === tool)!;
  const Icon = config.icon;
  const matches = projects?.filter((project) =>
    project.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selectedProject = projects?.find(
    (project) => project.id === selectedId,
  );
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    element?.showModal();
    heading.current?.focus({ preventScroll: true });
    return () => {
      element?.close();
      opener?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="quick-tool-title"
      aria-describedby="quick-tool-description"
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-[#111318] p-0 text-white shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex shrink-0 items-start gap-4 border-b border-white/10 p-5 sm:p-6">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.color}`}
          >
            <Icon size={23} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
              {config.label}
            </p>
            <h2
              ref={heading}
              tabIndex={-1}
              id="quick-tool-title"
              className="text-lg font-semibold leading-snug outline-none"
            >
              {config.prompt}
            </h2>
            <p
              id="quick-tool-description"
              className="mt-2 text-xs leading-relaxed text-white/50"
            >
              {config.hint}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close project chooser"
            className="-mr-1 shrink-0 rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Close size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
          <button
            onClick={onNew}
            className="group mb-6 flex w-full items-center gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.025] p-4 text-left transition hover:border-sky-300/50 hover:bg-sky-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-2xl font-light text-white/70"
            >
              +
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                Start a new project
              </span>
              <span className="mt-1 block text-xs text-white/40">
                Add your media and start with {config.label.toLowerCase()}.
              </span>
            </span>
            <ToolArrow />
          </button>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-white/70">
              Or use an existing project
            </h3>
            {projects && (
              <span className="text-[11px] text-white/35">
                {projects.length} projects
              </span>
            )}
          </div>
          {projects && projects.length > 0 && (
            <div className="relative mb-4">
              <svg
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" strokeLinecap="round" />
              </svg>
              <input
                aria-label="Search projects"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your projects"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none"
              />
            </div>
          )}
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-200/15 bg-amber-200/5 p-4"
            >
              <p className="text-xs text-amber-200/80">{error}</p>
              <button
                onClick={onRetry}
                className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"
              >
                Try again
              </button>
            </div>
          ) : matches === undefined ? (
            <div
              role="status"
              aria-label="Loading projects"
              className="space-y-2"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-white/5 motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : projects?.length === 0 ? (
            <div className="rounded-xl border border-white/10 p-6 text-center">
              <Video
                size={24}
                aria-hidden="true"
                className="mx-auto mb-3 text-white/25"
              />
              <p className="text-sm font-medium text-white/70">
                Your first story starts here
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/40">
                Start a new project above to try {config.label.toLowerCase()}.
              </p>
            </div>
          ) : matches.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-white/60">
                No projects match your search.
              </p>
              <button
                onClick={() => setQuery("")}
                className="mt-3 text-xs text-sky-300 hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <fieldset className="space-y-2">
              <legend className="sr-only">Choose a project</legend>
              {matches.map((project) => {
                const poster = thumbnailUrl(project.id, project.thumbnail);
                const selected = selectedId === project.id;
                return (
                  <label
                    key={project.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-sky-400 ${selected ? "border-sky-400/60 bg-sky-400/10" : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/5"}`}
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black text-white/25">
                      {poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={poster}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Video size={22} aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white/90">
                        {project.name}
                      </span>
                      <span className="mt-1 block text-[11px] text-white/40">
                        {formatUpdatedAt(project.updatedAt)} -{" "}
                        {project.clipCount}{" "}
                        {project.clipCount === 1 ? "clip" : "clips"}
                      </span>
                    </span>
                    <input
                      type="radio"
                      name="quick-tool-project"
                      value={project.id}
                      checked={selected}
                      onChange={() => setSelectedId(project.id)}
                      aria-label={project.name}
                      className="h-4 w-4 shrink-0 accent-sky-400"
                    />
                  </label>
                );
              })}
            </fieldset>
          )}
        </div>
        <footer className="shrink-0 border-t border-white/10 bg-white/[0.02] p-4 sm:px-6">
          <p className="mb-3 truncate text-xs text-white/45" role="status">
            {selectedProject
              ? `Selected: ${selectedProject.name}`
              : "Choose a project to continue"}
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/15 px-4 py-2.5 text-xs font-medium hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              disabled={!selectedProject || Boolean(error)}
              onClick={() => {
                if (selectedProject) onSelect(selectedProject);
              }}
              className="btn-brand-gradient flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold disabled:cursor-default disabled:opacity-35"
            >
              {config.action}
              <ToolArrow />
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
