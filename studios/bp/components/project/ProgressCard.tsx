type ProgressCardProps = {
  completed: number;
  total: number;
};

export function ProgressCard({
  completed,
  total,
}: ProgressCardProps) {
  const progress =
    (completed / total) * 100;

  return (
    <section className="rounded-3xl border border-border bg-card p-6">

      <div className="flex justify-between">

        <p className="font-medium">
          Progress
        </p>

        <p className="text-muted-foreground">
          {completed}/{total}
        </p>

      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">

        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-forest transition-all"
          style={{
            width: `${progress}%`,
          }}
        />

      </div>

    </section>
  );
}