import { Add } from "@veasnawt/vicons";

type NewProjectButtonProps = {
  onClick: () => void;
};

export function NewProjectButton({
  onClick,
}: NewProjectButtonProps) {
  return (
    <button
      onClick={onClick}
      className="
    inline-flex items-center gap-2
    rounded-xl bg-primary px-4 py-3
    font-medium text-primary-foreground
    shadow-[0_0_20px_-6px_var(--primary)]
    transition hover:bg-primary/85 hover:scale-[1.02] active:scale-[0.98]
  "
    >
      <Add size={20} />
      <span>New Project</span>
    </button>
  );
}