import { VideoFrameThumbnail } from "@veasnawt/vcut/src/ui/VideoFrameThumbnail";
import { nativeMediaUrl } from "@veasnawt/vcut/src/api/nativeStorage";
import type { LocalProjectSummary } from "@veasnawt/vcut/src/api/nativeStorage";

/** Renders a `LocalProjectSummary.coverAsset` — a video via `VideoFrameThumbnail` (a real, live-painted
 *  frame off the raw clip, no server-generated thumbnail to point at on native — see `nativeStorage.ts`'s
 *  own doc comment on `LocalProjectSummary`), a still image via a plain `<img>`. Shared by `HomeTab` and
 *  `ProjectsTab` so the two grids render project covers identically. */
export function ProjectThumbnail({ project, className }: { project: LocalProjectSummary; className?: string }) {
  if (!project.coverAsset) {
    return (
      <div className={`flex items-center justify-center ${className ?? ""}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/15">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M9 9.5v5l4.5-2.5L9 9.5Z" fill="currentColor" stroke="none" />
        </svg>
      </div>
    );
  }
  const src = nativeMediaUrl(project.id, project.coverAsset.relPath);
  if (project.coverAsset.kind === "video") {
    return <VideoFrameThumbnail src={src} time={0} className={`h-full w-full object-cover ${className ?? ""}`} />;
  }
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={src} className={`h-full w-full object-cover ${className ?? ""}`} />;
}
