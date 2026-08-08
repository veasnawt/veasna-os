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
      className="group block rounded-3xl border border-border bg-card p-6 transition hover:border-primary/40 hover:bg-card/80"
    >
      <div className="flex items-start justify-between">

        <div className="flex gap-4">

          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary/20">
                    {(() => {
                      const Icon = module.icon as any;
                      return Icon ? <Icon size={26} /> : null;
                    })()}
          </div>

          <div>

            <h3 className="text-xl font-semibold">
              {module.title}
            </h3>

            <p className="mt-2 max-w-md text-muted-foreground">
              {module.description}
            </p>

          </div>

        </div>

        <div className="text-2xl text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary">
          →
        </div>

      </div>
    </Link>
  );
}