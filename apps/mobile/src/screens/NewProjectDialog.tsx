import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RESOLUTION_PRESETS, type Project } from "@veasnawt/vcut/src/project/types";
import { addClip, trackKindForAsset } from "@veasnawt/vcut/src/timeline/operations";
import { nativeCreateProject, nativeImportMedia, nativeSaveProject } from "@veasnawt/vcut/src/api/nativeStorage";
import { formatFileSize } from "../format";

function presetAspectClass(label: string): string {
  if (label.startsWith("Vertical")) return "aspect-[9/16]";
  if (label.startsWith("Landscape")) return "aspect-[16/9]";
  return "aspect-square";
}

/** Trimmed mobile version of `studios/vcut/app/ProjectsDashboard.tsx`'s own `NewProjectDialog` — same
 *  name/preset/optional-starting-media shape, same `submit()` sequence (create, then import+place+save
 *  if media was picked — see that file's own doc comment for why media overrides the chosen preset with
 *  its real dimensions), just built on `nativeCreateProject`/`nativeImportMedia`/`nativeSaveProject`
 *  instead of `authFetch`-ed server routes, since this app has no server of its own to call. No
 *  drag-and-drop (a touch-only surface has nothing to drop onto) — a plain file input instead. */
export function NewProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (project: Project) => void }) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<(typeof RESOLUTION_PRESETS)[number]>(RESOLUTION_PRESETS[0]);
  const [media, setMedia] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setCreating(true);
    setError(null);
    try {
      let project = await nativeCreateProject(name.trim() || "Untitled", { width: preset.width, height: preset.height, fps: 30 });

      if (media) {
        const asset = await nativeImportMedia(project.bpProjectId, media);
        project = {
          ...project,
          assets: [...project.assets, asset],
          sequence: {
            ...project.sequence,
            width: asset.width ?? project.sequence.width,
            height: asset.height ?? project.sequence.height,
            fps: asset.fps ?? project.sequence.fps,
          },
          exportSettings: {
            ...project.exportSettings,
            width: asset.width ?? project.exportSettings.width,
            height: asset.height ?? project.exportSettings.height,
            fps: asset.fps ?? project.exportSettings.fps,
          },
        };
        const targetTrack = project.sequence.tracks.find((t) => t.kind === trackKindForAsset(asset));
        if (targetTrack) project = addClip(project, targetTrack.id, asset.id, 0);
        await nativeSaveProject(project.bpProjectId, project);
      }

      onCreated(project);
    } catch {
      setError("Couldn't create the project. Try again.");
      setCreating(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !creating && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="New project"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-white/10 bg-[#12151c] p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-white">New project</h2>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled project"
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-[16px] text-white placeholder:text-white/30 outline-none focus:border-sky-400"
          />
        </label>

        <div className="mt-5">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40">Resolution</span>
          <div className={`grid grid-cols-3 gap-2 transition ${media ? "pointer-events-none opacity-40" : ""}`}>
            {RESOLUTION_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPreset(p)}
                aria-pressed={!media && preset.label === p.label}
                className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition ${
                  !media && preset.label === p.label
                    ? "border-sky-400 bg-sky-500/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className={`flex h-10 items-center justify-center ${presetAspectClass(p.label)}`}>
                  <div
                    className={`h-full rounded-[3px] border-2 ${!media && preset.label === p.label ? "border-sky-400" : "border-white/30"}`}
                    style={{ aspectRatio: `${p.width} / ${p.height}` }}
                  />
                </div>
                <span className="text-center text-[11px] leading-tight text-white/70">
                  {p.label.split(" ")[0]}
                  <br />
                  <span className="text-white/40">
                    {p.width}×{p.height}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/40">
            Starting media <span className="normal-case text-white/25">(optional)</span>
          </span>
          {media ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs text-white/80">{media.name}</p>
                <p className="text-[11px] text-white/40">{formatFileSize(media.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMedia(null);
                  if (mediaInputRef.current) mediaInputRef.current.value = "";
                }}
                aria-label="Remove starting media"
                className="shrink-0 rounded p-1.5 text-white/40"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 px-3 py-4 text-center">
              <span className="text-xs text-white/50">Tap to choose a video, image, or audio file</span>
              <input
                ref={mediaInputRef}
                type="file"
                accept="video/*,image/*,audio/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && setMedia(e.target.files[0])}
              />
            </label>
          )}
        </div>

        {error && <p className="mt-4 text-xs text-amber-200/80">{error}</p>}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={creating} className="rounded-md px-3 py-1.5 text-xs font-medium text-white/60 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={creating}
            className="rounded-md bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
