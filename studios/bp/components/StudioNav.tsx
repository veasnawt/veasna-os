import Link from "next/link";

// Rixie's chat used to be reachable from here (linking to /agent) — she's core OS infrastructure
// now, not a BP Studio feature, reachable from Veasna OS's own taskbar instead (see
// packages/universe/src/components/RixieWindow.tsx). No replacement link belongs here; BP Studio
// itself never depended on that route for anything else.
export function StudioNav() {
  return (
    <nav className="flex items-center justify-between">
      <Link
        href="/"
        className="flex items-center gap-2.5 rounded-full border border-border bg-card/60 px-4 py-2 backdrop-blur-xl transition hover:border-primary/40"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        <span className="text-xs font-semibold tracking-wide text-foreground">
          BP Studio
        </span>
      </Link>
    </nav>
  );
}
