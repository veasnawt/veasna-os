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
      className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-600 transition"
    >
      <p className="text-sm text-neutral-500">{code}</p>

      <h2 className="mt-2 text-xl font-semibold">
        {title}
      </h2>

      <p className="mt-6 text-blue-400">
        Open →
      </p>
    </Link>
  )
}