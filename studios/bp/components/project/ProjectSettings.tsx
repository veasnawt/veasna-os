type ProjectSettingsProps = {
  onDelete: () => void;
};

export function ProjectSettings({
  onDelete,
}: ProjectSettingsProps) {
  return (
    <section>

      <h2 className="text-2xl font-bold">
        Project Settings
      </h2>

      <button
        onClick={onDelete}
        className="mt-6 rounded-xl border border-destructive/40 px-5 py-3 text-destructive transition hover:bg-destructive/10"
      >
        Delete Project
      </button>

    </section>
  );
}