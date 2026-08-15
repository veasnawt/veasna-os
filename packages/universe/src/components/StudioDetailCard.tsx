import React from "react";
import { ExternalLink } from "@veasnawt/vicons";
import { CelestialBody } from "../types";

interface StudioDetailCardProps {
  body: CelestialBody;
  onClose?: () => void;
  /** "overlay" = floating popover (3D inspector). "embedded" = fills a content panel (traditional shell / window chrome). */
  variant?: "overlay" | "embedded";
  /** Set false when a parent (e.g. WindowChrome) already renders its own title bar. */
  showHeader?: boolean;
  /** Opens the studio as an in-OS window. Falls back to a new-tab link if omitted. */
  onOpenApp?: (body: CelestialBody) => void;
}

export default function StudioDetailCard({
  body,
  onClose,
  variant = "overlay",
  showHeader = true,
  onOpenApp,
}: StudioDetailCardProps) {
  const containerClass =
    variant === "overlay"
      ? "pointer-events-auto absolute top-20 right-6 sm:right-8 w-[calc(100vw-3rem)] max-w-sm rounded-3xl border border-[var(--os-border)] bg-[var(--os-surface-strong)] p-6 shadow-2xl backdrop-blur-[var(--os-blur)] backdrop-saturate-[var(--os-saturate)] transition-all text-[var(--os-text)]"
      : "w-full max-w-xl p-6 text-[var(--os-text)]";

  return (
    <div className={containerClass}>
      {showHeader && (
      <div className="flex items-center justify-between pb-3 border-b border-[var(--os-border)]">
        <div className="flex items-center gap-2.5">
          <span
            className="h-3 w-3 rounded-full shadow-[0_0_10px_currentColor]"
            style={{ backgroundColor: body.color, color: body.color }}
          />
          <h3 className="font-display text-sm font-bold text-[var(--os-text)]">
            {body.name}
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-[var(--os-text-muted)] hover:bg-[var(--os-border-strong)] hover:text-[var(--os-text)]"
          >
            ✕
          </button>
        )}
      </div>
      )}

      <p className={`${showHeader ? "mt-3" : ""} text-[11px] font-mono font-medium text-[var(--os-accent-text)]`}>
        {body.subtitle}
      </p>

      <p className="mt-2 text-xs text-[var(--os-text-muted)] leading-relaxed font-sans">
        {body.description}
      </p>

      <div className="mt-4 space-y-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--os-text-muted)] font-semibold">
          Capabilities
        </span>
        <ul className="space-y-1.5">
          {body.details.map((d, i) => (
            <li key={i} className="flex items-center gap-2 text-[11px] text-[var(--os-text-muted)] font-medium">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--os-accent)" }} />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </div>

      {body.launchUrl ? (
        onOpenApp ? (
          <button
            onClick={() => onOpenApp(body)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--os-accent-soft)] border border-[var(--os-accent-border)] px-4 py-2.5 text-xs font-bold text-[var(--os-accent-text)] transition-all hover:brightness-110"
          >
            Open Studio
            <ExternalLink size={13} />
          </button>
        ) : (
          <a
            href={body.launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-[var(--os-accent-soft)] border border-[var(--os-accent-border)] px-4 py-2.5 text-xs font-bold text-[var(--os-accent-text)] transition-all hover:brightness-110"
          >
            Open Studio
            <ExternalLink size={13} />
          </a>
        )
      ) : (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--os-border)] px-4 py-2.5 text-xs font-semibold text-[var(--os-text-muted)]">
          Coming soon
        </div>
      )}
    </div>
  );
}
