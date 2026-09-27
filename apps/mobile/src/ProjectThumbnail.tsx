import { VideoFrameThumbnail } from "@veasnawt/vcut/src/ui/VideoFrameThumbnail";
import { nativeMediaUrl } from "@veasnawt/vcut/src/api/nativeStorage";
import type { LocalProjectSummary } from "@veasnawt/vcut/src/api/nativeStorage";
import { EmptyProjectThumbnail } from "@veasnawt/vcut/src/ui/EmptyProjectThumbnail";

/** Renders a `LocalProjectSummary.coverAsset` — a video via `VideoFrameThumbnail` (a real, live-painted
 *  frame off the raw clip, no server-generated thumbnail to point at on native — see `nativeStorage.ts`'s
 *  own doc comment on `LocalProjectSummary`), a still image via a plain `<img>`. Shared by `HomeTab` and
 *  `ProjectsTab` so the two grids render project covers identically. */
export function ProjectThumbnail({ project, className }: { project: LocalProjectSummary; className?: string }) {
  if (!project.coverAsset || project.clipCount === 0) {
    return (
      <div className={`h-full w-full ${className ?? ""}`}>
        <EmptyProjectThumbnail empty={project.clipCount === 0} />
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
