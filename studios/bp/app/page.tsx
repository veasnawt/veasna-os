"use client";

import { useEffect, useState } from "react";

import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { loadProjects } from "@/lib/project-service";
import { Project } from "@/types/project";
import { ProjectCard } from "@/components/ProjectCard";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/project-service";
import { NewProjectButton } from "@/components/NewProjectButton";

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);

  function handleNewProject() {
    const project = createProject();

    router.push(`/projects/${project.id}`);
  }

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">

        <header>
          <h1 className="text-5xl font-bold tracking-tight">
            {APP_NAME}
          </h1>

          <p className="mt-2 text-neutral-400">
            {APP_TAGLINE}
          </p>
        </header>

        {projects.length === 0 ? (
          <section className="mt-16 rounded-2xl border border-dashed border-neutral-800 p-12 text-center">

            <h2 className="text-2xl font-semibold">
              Welcome 👋
            </h2>

            <p className="mt-4 text-neutral-400">
              You don't have any projects yet.
            </p>

            <p className="mt-2 text-neutral-500">
              Create your first project to begin your creative journey.
            </p>

            <NewProjectButton onClick={handleNewProject} />

          </section>
        ) : (
          <section className="mt-12">

            <div className="mb-6 flex items-center justify-between">

              <h2 className="text-2xl font-semibold">
                Projects
              </h2>

              <NewProjectButton onClick={handleNewProject} />

            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  {...project}
                />
              ))}
            </div>

          </section>
        )}

      </div>
    </main>
  );
}