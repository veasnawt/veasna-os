"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  getProjectById,
  updateProject,
} from "@/lib/project-service";

import { Project } from "@/types/project";
import { Idea } from "@veasnawt/vicons";
import { StudioNav } from "@/components/StudioNav";
import { OceanBackdrop } from "@/components/OceanBackdrop";

export default function IdeaPage() {
  const { id } = useParams<{ id: string }>();

  const [project, setProject] =
    useState<Project | null>(null);

  useEffect(() => {
    const loaded = getProjectById(id);

    if (loaded) {
      setProject(loaded);
    }
  }, [id]);

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        Project not found.
      </main>
    );
  }

  function handleIdeaChange(
    content: string
  ) {
    if (!project) {
      return;
    }

    const updated: Project = {
      ...project,
      idea: {
        ...project.idea,
        content,
      },
    };

    setProject(updated);
    updateProject(updated);
  }

  return (
    <main className="relative min-h-screen">
      <OceanBackdrop />

      <div className="relative mx-auto max-w-4xl px-6 py-10">
        <StudioNav />

        <Link
          href={`/projects/${project.id}`}
          className="mt-16 inline-block text-muted-foreground hover:text-foreground"
        >
          ← Back to Project
        </Link>

        <div className="mt-10">

          <p className="text-sm font-mono uppercase tracking-[0.3em] text-primary/70">
            {project.code}
          </p>

          <h1 className="mt-2 flex items-center gap-3 text-5xl font-bold">
            <Idea size={64} />
            <span>Idea</span>
          </h1>

          <p className="mt-4 text-muted-foreground">
            What's the core idea behind this project?
          </p>

        </div>

        <section className="mt-12">

          <label className="text-sm text-muted-foreground">
            Idea
          </label>

          <textarea
            value={project.idea.content}
            onChange={(e) =>
              handleIdeaChange(e.target.value)
            }
            placeholder="Start writing..."
            className="mt-3 h-96 w-full rounded-2xl border border-border bg-card p-6 text-lg outline-none transition focus:border-primary/50"
          />

          <p className="mt-3 text-sm text-muted-foreground">
            Changes are saved automatically.
          </p>

        </section>

      </div>
    </main>
  );
}