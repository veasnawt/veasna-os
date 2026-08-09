import React from "react";

/** Generic icon for a "local app" desktop shortcut (points at a real, user-picked .exe/.lnk) — a
 *  fallback for when the native icon extracted at install time (LocalApp.iconDataUrl) isn't
 *  available. Not sourced from @veasnawt/vicons: that package's checked-out dist under
 *  node_modules/.pnpm is pinned to an older published version with no generic "apps" glyph, and
 *  bumping/republishing it isn't warranted just for this — same reasoning as the existing local
 *  TaskManagerIcon/AboutOSIcon/OSUpdateIcon components. */
export default function LocalAppIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
