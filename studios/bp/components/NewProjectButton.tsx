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
    rounded-xl bg-white px-3 py-3
    font-medium text-black
    transition hover:bg-neutral-200
  "
    >
      <Add size={20} />
      <span>New Project</span>
    </button>
  );
}