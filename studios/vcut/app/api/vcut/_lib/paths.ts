import fs from "fs";
import path from "path";

/** Where VCut keeps its data on disk.
 *
 *  `VEASNA_WORKSPACE_ROOT` is the same convention studios/universe uses (see its
 *  app/api/_lib/sandboxedFs.ts): the packaged Electron app sets it to a real, user-visible,
 *  backup-friendly folder (Documents/Veasna OS), while in dev it's unset and this falls back to a
 *  path computed from `process.cwd()` at runtime. Never a hardcoded machine path either way, so the
 *  same code works from a repo checkout, from a different drive, and from an installed .exe with no
 *  monorepo on disk at all. */
const WORKSPACE_PARENT = process.env.VEASNA_WORKSPACE_ROOT ?? path.resolve(process.cwd(), "../..");

export const VCUT_ROOT = path.join(WORKSPACE_PARENT, ".vcut");

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Project ids arrive from the URL, so they are untrusted input that gets concatenated into a
 *  filesystem path. Restricting them to a conservative character set means a crafted id can never
 *  escape VCUT_ROOT via `..`, an absolute path, a drive letter, or a NUL byte. BP's own ids are
 *  `crypto.randomUUID()`, which this comfortably allows. */
export function assertValidProjectId(id: string): void {
  if (!id || id.length > 128 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new ApiError(400, "Invalid project id", "invalid-project-id");
  }
}

export interface ProjectPaths {
  dir: string;
  projectFile: string;
  mediaDir: string;
  thumbnailsDir: string;
  exportsDir: string;
  /** Scratch space for a job's own intermediate files (e.g. the "Remove Object" inpaint pipeline's
   *  extracted clip + synthesized mask before either is uploaded anywhere) — scoped per-project rather
   *  than `os.tmpdir()` (unlike the export job's own text-file scratch dir) because these intermediates
   *  can be tens of MB and per-job; keeping them inside the project folder means a crashed/interrupted
   *  job's leftovers are visible and cleanable the same way the rest of the project's data is, instead
   *  of scattered in a shared OS temp dir. Each job is still responsible for deleting its own files
   *  once it finishes (success or failure) — this directory is not itself auto-purged. */
  scratchDir: string;
  /** The project's own reusable ".cube" 3D LUT library (`project.luts`) — see `LutAsset`'s own doc
   *  comment. Same per-project, per-kind directory shape as `mediaDir`/`thumbnailsDir`, just for a
   *  library entry rather than a placeable asset. */
  lutsDir: string;
  /** The project's own reusable custom-font library (`project.customFonts`) — see `CustomFontAsset`'s
   *  own doc comment. Same shape as `lutsDir`. */
  customFontsDir: string;
  /** The project's own reusable "My Sounds" library (`project.customSfx`) — see `CustomSfxAsset`'s own
   *  doc comment. Same shape as `lutsDir`. */
  customSfxDir: string;
}

export function projectPaths(bpProjectId: string): ProjectPaths {
  assertValidProjectId(bpProjectId);
  const dir = path.join(VCUT_ROOT, bpProjectId);
  return {
    dir,
    projectFile: path.join(dir, "project.json"),
    mediaDir: path.join(dir, "media"),
    thumbnailsDir: path.join(dir, "thumbnails"),
    exportsDir: path.join(dir, "exports"),
    scratchDir: path.join(dir, "scratch"),
    lutsDir: path.join(dir, "luts"),
    customFontsDir: path.join(dir, "custom-fonts"),
    customSfxDir: path.join(dir, "custom-sfx"),
  };
}

export function ensureProjectDirs(bpProjectId: string): ProjectPaths {
  const paths = projectPaths(bpProjectId);
  for (const dir of [
    paths.dir,
    paths.mediaDir,
    paths.thumbnailsDir,
    paths.exportsDir,
    paths.scratchDir,
    paths.lutsDir,
    paths.customFontsDir,
    paths.customSfxDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}

/** Resolves a project-relative media/thumbnail path to an absolute one, refusing anything that
 *  escapes the containing directory. Asset `relPath` values come out of a project file, which a user
 *  can hand-edit, so they get the same treatment as any other untrusted path input. */
export function resolveWithin(baseDir: string, relPath: string): string {
  const resolved = path.resolve(baseDir, relPath);
  const base = path.resolve(baseDir);
  // The separator check stops "/media-evil" from passing a naive `startsWith("/media")` test.
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new ApiError(400, "Path escapes the project folder", "path-escape");
  }
  return resolved;
}

/** Turns an arbitrary uploaded filename into one that's safe to write to disk, while keeping it
 *  recognisable to the user in the media library. */
export function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^A-Za-z0-9._-]/g, "_");
  return base.slice(0, 120) || "media";
}

/** Adds a short random suffix so importing two different files that happen to share a name doesn't
 *  have the second silently overwrite the first. */
export function uniqueFileName(name: string): string {
  const safe = safeFileName(name);
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length) || "media";
  return `${stem}-${crypto.randomUUID().slice(0, 8)}${ext}`;
}

/** A Supabase user id — always a real UUID in practice (it comes straight out of a verified session
 *  token, never user-typed input), but this still gets concatenated into a filesystem path the same
 *  way a project id does, so it gets the same defensive validation `assertValidProjectId` gives that
 *  one rather than trusting the token's own shape implicitly. */
function assertValidUserId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(400, "Invalid user id", "invalid-user-id");
  }
}

export interface UserMediaPaths {
  dir: string;
  mediaDir: string;
  thumbnailsDir: string;
}

/** Where a user's own reusable media library lives — `VCUT_ROOT/users/<userId>/...`, deliberately
 *  siblings of the per-project folders `projectPaths` returns, not nested under any one of them: a
 *  library asset is meant to outlive and be shared across every project that references it, so its
 *  storage can't be scoped to (or deleted along with) any single project's own directory the way an
 *  old project-local upload was. Hosted-only in practice (nothing calls this outside `VCUT_HOSTED` —
 *  local/desktop single-user installs have no separate "account" for a library to belong TO, and keep
 *  using each project's own `mediaDir` exactly as before this existed). */
export function userMediaPaths(userId: string): UserMediaPaths {
  assertValidUserId(userId);
  const dir = path.join(VCUT_ROOT, "users", userId);
  return {
    dir,
    mediaDir: path.join(dir, "media"),
    thumbnailsDir: path.join(dir, "thumbnails"),
  };
}

export function ensureUserMediaDirs(userId: string): UserMediaPaths {
  const paths = userMediaPaths(userId);
  for (const dir of [paths.dir, paths.mediaDir, paths.thumbnailsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}
