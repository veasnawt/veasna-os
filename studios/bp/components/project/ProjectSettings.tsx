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
        className="mt-6 rounded-xl border border-red-700 px-5 py-3 text-red-400 transition hover:bg-red-900/20"
      >
        Delete Project
      </button>

    </section>
  );
}