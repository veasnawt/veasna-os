"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

/** Plain inline SVGs, not `@veasnawt/vicons` — this app's own dashboard chrome (`ProjectsDashboard.tsx`)
 *  never pulled in that package either (it talks to `/api/vcut/*` directly rather than through
 *  `packages/vcut`, per `_shared/hostedClient.ts`'s own doc comment on why dashboard-level pages stay
 *  independent of the editor package) — four small, one-off glyphs aren't worth adding a new dependency
 *  for. Each takes `active` so filled-vs-outline can be a single component, matching the selected-tab
 *  convention every mobile OS tab bar uses. */
function HomeIcon({ active }: { active: boolean }) {
  // Its own filled shape rather than the outline's paths with `strokeWidth={0}` like the other icons:
  // the roof is a stroke-only line with nothing to fill, so zeroing the stroke erased it and left just
  // the notched body square.
  if (active) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.36 3.53a1 1 0 0 1 1.28 0l8 6.67A1 1 0 0 1 20 12h-1v7a1 1 0 0 1-1 1h-4v-6h-4v6H6a1 1 0 0 1-1-1v-7H4a1 1 0 0 1-.64-1.77Z" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProjectsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
      <rect x="3.5" y="5.5" width="8" height="7" rx="1.2" fill={active ? "currentColor" : "none"} />
      <rect x="12.5" y="5.5" width="8" height="7" rx="1.2" fill={active ? "currentColor" : "none"} />
      <rect x="3.5" y="13.5" width="8" height="5" rx="1.2" fill={active ? "currentColor" : "none"} />
      <rect x="12.5" y="13.5" width="8" height="5" rx="1.2" fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

function TemplatesIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" fill={active ? "currentColor" : "none"} />
      <path d="M9.5 9.5v5l4.5-2.5-4.5-2.5Z" fill={active ? "#0a0c10" : "currentColor"} stroke="none" />
    </svg>
  );
}

function MeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
      <circle cx="12" cy="8" r="3.4" fill={active ? "currentColor" : "none"} />
      <path
        d="M4.5 20c0-3.6 3.36-6.5 7.5-6.5s7.5 2.9 7.5 6.5"
        fill={active ? "currentColor" : "none"}
        strokeLinecap="round"
      />
    </svg>
  );
}

const TABS: Tab[] = [
  { href: "/home", label: "Home", icon: (active) => <HomeIcon active={active} /> },
  { href: "/projects", label: "Projects", icon: (active) => <ProjectsIcon active={active} /> },
  { href: "/templates", label: "Templates", icon: (active) => <TemplatesIcon active={active} /> },
  { href: "/me", label: "Me", icon: (active) => <MeIcon active={active} /> },
];

/** The persistent Home/Projects/Templates/Me navigation — a bottom bar below `lg` (matching this
 *  app's own established "no real mouse below this breakpoint" convention, e.g. `MediaLibrary.tsx`'s
 *  hover-reveal controls), a left sidebar at `lg` and up. One shared component/active-state logic
 *  either way, just re-laid-out via `orientation`, so the two never drift out of sync with each other
 *  (which tabs exist, in what order, highlighted how) the way two independently-written components
 *  eventually would. */
export function TabBar() {
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-[#0a0c10]/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={pathname === tab.href || pathname.startsWith(`${tab.href}/`)} orientation="bottom" />
        ))}
      </nav>

      <nav
        aria-label="Primary"
        className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col gap-1 border-r border-white/10 bg-[#0a0c10] p-3 lg:flex"
      >
        <div className="mb-4 flex items-center gap-2 px-2 pt-1 text-base font-semibold text-white">
          <img src="/vcut-logo.png" alt="" className="h-6 w-6" />
          VCut
        </div>
        {TABS.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={pathname === tab.href || pathname.startsWith(`${tab.href}/`)} orientation="side" />
        ))}
      </nav>
    </>
  );
}

function TabLink({ tab, active, orientation }: { tab: Tab; active: boolean; orientation: "bottom" | "side" }) {
  if (orientation === "side") {
    return (
      <Link
        href={tab.href}
        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
          active ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/80"
        }`}
      >
        {tab.icon(active)}
        {tab.label}
      </Link>
    );
  }
  return (
    <Link
      href={tab.href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
        active ? "text-white" : "text-white/45"
      }`}
    >
      {tab.icon(active)}
      {tab.label}
    </Link>
  );
}

/** Reserves room for `TabBar` so page content never renders underneath it — bottom padding on mobile
 *  (plus the safe-area inset, matched to `TabBar`'s own), left padding for the sidebar at `lg`. Every
 *  tab page wraps its own content in this rather than each re-deriving the same two numbers. */
export function TabBarSpacer({ children }: { children: React.ReactNode }) {
  // `pb-20` (5rem) is a deliberately generous approximation of the bottom bar's own rendered height
  // PLUS a typical safe-area inset (home-indicator devices), not an exact match — a few extra px of
  // blank space below the content is harmless; content peeking out from under the bar is not.
  return <div className="min-h-dvh pb-20 lg:pb-0 lg:pl-56">{children}</div>;
}
