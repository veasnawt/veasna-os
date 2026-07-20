import Link from "next/link";

import { WorkflowModule } from "@/types/workflow";

type WorkflowCardProps = {
  projectId: string;
  module: WorkflowModule;
};

export function WorkflowCard({
  projectId,
  module,
}: WorkflowCardProps) {
  return (
    <Link
      href={`/projects/${projectId}/${module.route}`}
      className="group block rounded-3xl border border-neutral-800 bg-neutral-900 p-6 transition hover:border-neutral-600 hover:bg-neutral-800"
    >
      <div className="flex items-start justify-between">

        <div className="flex gap-4">

          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-3xl">
            {module.icon}
          </div>

          <div>

            <h3 className="text-xl font-semibold">
              {module.title}
            </h3>

            <p className="mt-2 max-w-md text-neutral-400">
              {module.description}
            </p>

          </div>

        </div>

        <div className="text-2xl text-neutral-600 transition group-hover:translate-x-1">
          →
        </div>

      </div>
    </Link>
  );
}