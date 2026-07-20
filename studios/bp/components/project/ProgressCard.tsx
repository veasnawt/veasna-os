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
    <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">

      <div className="flex justify-between">

        <p className="font-medium">
          Progress
        </p>

        <p className="text-neutral-400">
          {completed}/{total}
        </p>

      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-800">

        <div
          className="h-full rounded-full bg-white transition-all"
          style={{
            width: `${progress}%`,
          }}
        />

      </div>

    </section>
  );
}