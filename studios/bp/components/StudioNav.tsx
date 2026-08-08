import Link from "next/link";
import { Ai } from "@veasnawt/vicons";

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

      <Link
        href="/agent"
        className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20 hover:border-primary/50"
      >
        <Ai size={14} />
        <span>Rixie</span>
      </Link>
    </nav>
  );
}
