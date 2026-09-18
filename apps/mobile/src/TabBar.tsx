export type TabId = "home" | "projects" | "templates" | "me";

interface Tab {
  id: TabId;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

/** Same four glyphs as `studios/vcut/app/_shared/TabBar.tsx`'s own icons, copied rather than shared —
 *  that file is a Next.js `"use client"` component using `next/link`/`usePathname`, neither of which
 *  exist in this plain Vite/Capacitor app (no router at all here, just `App.tsx`'s own `view` state).
 *  Kept visually identical so switching between the hosted/desktop tab bar and this one reads as the
 *  same app, not two different products. */
function HomeIcon({ active }: { active: boolean }) {
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
  { id: "home", label: "Home", icon: (active) => <HomeIcon active={active} /> },
  { id: "projects", label: "Projects", icon: (active) => <ProjectsIcon active={active} /> },
  { id: "templates", label: "Templates", icon: (active) => <TemplatesIcon active={active} /> },
  { id: "me", label: "Me", icon: (active) => <MeIcon active={active} /> },
];

/** The persistent bottom tab bar — mobile-only (no `lg` side-rail variant, unlike the web host's own
 *  `TabBar`, since this app never runs at desktop width). `env(safe-area-inset-bottom)` matches
 *  `index.css`'s own Android/iOS split (see that file's own doc comment): this padding is always safe
 *  to apply here regardless of platform, since Android's native edge-to-edge margin only pushes `#root`
 *  as a whole, not this bar's own bottom edge specifically. */
export function TabBar({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-[#0a0c10]/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
            active === tab.id ? "text-white" : "text-white/45"
          }`}
        >
          {tab.icon(active === tab.id)}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

/** Reserves room for `TabBar` so page content never renders underneath it — same `pb-20` approximation
 *  `TabBarSpacer` (the web host's own version) uses, deliberately generous rather than exact. */
export function TabBarSpacer({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh pb-20">{children}</div>;
}
