type ProjectHeaderProps = {
  code: string;
  title: string;
  onTitleChange: (title: string) => void;
};

export function ProjectHeader({
  code,
  title,
  onTitleChange,
}: ProjectHeaderProps) {
  return (
    <header>
      <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">
        {code}
      </p>

      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="mt-2 w-full bg-transparent text-5xl font-bold tracking-tight outline-none"
      />

      <p className="mt-3 text-neutral-500">
        Draft
      </p>
    </header>
  );
}