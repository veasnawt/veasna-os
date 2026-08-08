"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  deleteProject,
  getProjectById,
  updateProject,
} from "@/lib/project-service";

import { Project } from "@/types/project";

import { ProjectHeader } from "@/components/project/ProjectHeader";
import { ContinueCard } from "@/components/project/ContinueCard";
import { ProgressCard } from "@/components/project/ProgressCard";
import { WorkflowSection } from "@/components/project/WorkflowSection";
import { ProjectSettings } from "@/components/project/ProjectSettings";
import { StudioNav } from "@/components/StudioNav";
import { OceanBackdrop } from "@/components/OceanBackdrop";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

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

  function handleTitleChange(title: string) {
    if (!project) {
      return;
    }

    const updated = {
      ...project,
      title,
    };

    setProject(updated);
    updateProject(updated);
  }

  function handleDelete() {
    if (!project) {
      return;
    }

    if (
      !window.confirm(
        `Delete "${project.title}"?`
      )
    ) {
      return;
    }

    deleteProject(project.id);

    router.push("/");
  }

  return (
    <main className="relative min-h-screen">
      <OceanBackdrop />

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        <StudioNav />

        <Link
          href="/"
          className="mt-16 inline-block text-muted-foreground hover:text-foreground"
        >
          ← Projects
        </Link>

        <ProjectHeader
          code={project.code}
          title={project.title}
          onTitleChange={handleTitleChange}
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">

          <ContinueCard />

          <ProgressCard
            completed={0}
            total={9}
          />

        </div>

        <div className="mt-12">

          <WorkflowSection
            projectId={project.id}
          />

        </div>

        <div className="mt-12">

          <ProjectSettings
            onDelete={handleDelete}
          />

        </div>

      </div>
    </main>
  );
}