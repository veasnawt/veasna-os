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
    <header className="mt-4">
      <p className="text-sm font-mono uppercase tracking-[0.3em] text-primary/70">
        {code}
      </p>

      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="mt-2 w-full bg-transparent text-5xl font-bold tracking-tight outline-none focus:text-primary"
      />

      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-2.5 py-1 text-xs font-semibold text-gold">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        Draft
      </p>
    </header>
  );
}