"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProjectsDashboard } from "../ProjectsDashboard";
import { useSupabaseSession } from "@veasnawt/auth";

const HOSTED = process.env.NEXT_PUBLIC_VCUT_HOSTED === "true";

/** The hosted build's project list — `/` is a marketing page there instead (see `app/page.tsx`), so
 *  a signed-in visitor lands here. Requires a session: `user === null` (checked, genuinely signed
 *  out — see `useSupabaseSession`'s own doc comment on why that's distinct from `undefined`, still
 *  loading) redirects to `/login` rather than rendering a dashboard with nothing in it to show. */
export default function ProjectsPage() {
  const router = useRouter();
  const { user } = useSupabaseSession();

  useEffect(() => {
    if (HOSTED && user === null) router.replace("/login");
  }, [user, router]);

  if (HOSTED && user === undefined) {
    return <main className="flex min-h-dvh items-center justify-center bg-[#0a0c10] text-xs text-white/40">Loading…</main>;
  }
  if (HOSTED && !user) return null; // redirecting

  return <ProjectsDashboard />;
}
