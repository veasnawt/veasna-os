import { workflowModules } from "@/lib/workflow";
import { WorkflowCard } from "./WorkflowCard";

type WorkflowSectionProps = {
  projectId: string;
};

export function WorkflowSection({
  projectId,
}: WorkflowSectionProps) {
  return (
    <section>
      <h2 className="text-2xl font-bold text-foreground">
        Workflow
      </h2>

      <div className="mt-6 grid gap-4">
        {workflowModules.map((module) => (
          <WorkflowCard
            key={module.id}
            projectId={projectId}
            module={module}
          />
        ))}
      </div>
    </section>
  );
}