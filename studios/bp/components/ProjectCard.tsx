import Link from "next/link"

type ProjectCardProps = {
  id: string
  code: string
  title: string
}

export function ProjectCard({
  id,
  code,
  title,
}: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${id}`}
      className="group block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40 hover:bg-card/80 hover:shadow-[0_0_30px_-10px_var(--primary)]"
    >
      <p className="text-sm font-mono text-muted-foreground">{code}</p>

      <h2 className="mt-2 text-xl font-semibold">
        {title}
      </h2>

      <p className="mt-6 text-primary transition group-hover:translate-x-0.5">
        Open →
      </p>
    </Link>
  )
}