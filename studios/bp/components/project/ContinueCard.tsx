export function ContinueCard() {
  return (
    <section className="rounded-3xl border border-border bg-card p-8">

      <p className="text-sm text-muted-foreground">
        Continue Creating
      </p>

      <h2 className="mt-2 text-3xl font-bold">
        Idea
      </h2>

      <p className="mt-2 text-muted-foreground">
        Capture the core idea behind this project.
      </p>

      <button className="mt-8 rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground shadow-[0_0_20px_-6px_var(--primary)] transition hover:bg-primary/85">
        Continue →
      </button>

    </section>
  );
}