type NewProjectButtonProps = {
  onClick: () => void;
};

export function NewProjectButton({
  onClick,
}: NewProjectButtonProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl bg-white px-6 py-3 font-medium text-black transition hover:bg-neutral-200"
    >
      + New Project
    </button>
  );
}