import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { ApiError } from "./paths";

/** Where the local "Remove Object" provider's Python runtime + ProPainter checkout live — hardcoded to
 *  D: rather than derived from `VEASNA_WORKSPACE_ROOT` (unlike `VSTUDIO_ROOT` in `paths.ts`). This is a
 *  one-off, disk-space-driven choice for THIS machine (C: had only ~1GB free when this was built, not
 *  enough for a PyTorch install + weights), not a portable convention — a different machine would need
 *  a different constant here. */
const MODEL_ROOT = "D:\\Veasna\\vstudio-models\\propainter";
const REPO_DIR = path.join(MODEL_ROOT, "repo");
const VENV_DIR = path.join(MODEL_ROOT, "venv");
const VENV_PYTHON = path.join(VENV_DIR, "Scripts", "python.exe");
const SETUP_MARKER = path.join(MODEL_ROOT, ".setup-complete");

export { REPO_DIR, VENV_PYTHON };

export function getLocalSetupStatus(): { ready: boolean } {
  return {
    ready:
      fs.existsSync(VENV_PYTHON) &&
      fs.existsSync(SETUP_MARKER) &&
      fs.existsSync(path.join(REPO_DIR, "inference_propainter.py")),
  };
}

export type LocalSetupStage = "cloning" | "venv" | "installing" | "finalizing";
export type LocalSetupJobStatus = "running" | "done" | "failed" | "cancelled";

export interface LocalSetupJob {
  id: string;
  status: LocalSetupJobStatus;
  stage: LocalSetupStage;
  progress: number;
  error?: string;
  currentProcess: ChildProcess | null;
  abortController: AbortController;
  changed: Promise<void>;
  notify: () => void;
}

const STAGE_RANGES: Record<LocalSetupStage, [number, number]> = {
  cloning: [0, 0.15],
  venv: [0.15, 0.25],
  installing: [0.25, 0.95],
  finalizing: [0.95, 1],
};

function setStageProgress(job: LocalSetupJob, stage: LocalSetupStage, fraction: number) {
  const [start, end] = STAGE_RANGES[stage];
  job.stage = stage;
  job.progress = start + (end - start) * Math.min(1, Math.max(0, fraction));
  job.notify();
}

/** Runs one child process to completion, killable via `job.currentProcess`/`job.abortController` and
 *  reporting a coarse 0→1 progress the moment it starts producing any output (no fine-grained signal
 *  from `git`/`pip` worth parsing) — mirrors `runFfmpeg`'s own rolling stderr tail for error messages. */
function runStep(job: LocalSetupJob, command: string, args: string[], options: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, { cwd: options.cwd, windowsHide: true });
    } catch (err) {
      reject(new ApiError(500, `Could not start ${command}: ${err instanceof Error ? err.message : String(err)}`, "spawn-failed"));
      return;
    }
    job.currentProcess = child;

    let sawOutput = false;
    let stderrTail = "";
    const markAlive = () => {
      if (!sawOutput) {
        sawOutput = true;
        job.notify();
      }
    };
    child.stdout?.on("data", markAlive);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
      markAlive();
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new ApiError(500, `${command} was not found on PATH. Install it and try again.`, "binary-missing"));
      } else {
        reject(new ApiError(500, `Could not run ${command}: ${err.message}`, "spawn-failed"));
      }
    });
    child.on("close", (code, signal) => {
      job.currentProcess = null;
      if (code === 0) return resolve();
      if (signal) return reject(new ApiError(499, "Cancelled", "cancelled"));
      const detail = stderrTail.trim().split("\n").slice(-6).join("\n");
      reject(new ApiError(500, `${command} failed (exit ${code})${detail ? `:\n${detail}` : ""}`, "step-failed"));
    });
  });
}

const BROKEN_READ_VIDEO = `        vframes, aframes, info = torchvision.io.read_video(filename=frame_root, pts_unit='sec') # RGB
        frames = list(vframes.numpy())
        frames = [Image.fromarray(f) for f in frames]
        fps = info['video_fps']`;

const FIXED_READ_VIDEO = `        # torchvision.io.read_video was removed in torchvision 0.24 (deprecated since 0.22); no
        # version with it still present has a Python 3.14 wheel, so this reads frames via cv2
        # (already a hard dependency) instead, keeping the same (list[Image.Image] RGB, fps) contract.
        cap = cv2.VideoCapture(frame_root)
        fps = cap.get(cv2.CAP_PROP_FPS) or 24
        frames = []
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frames.append(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
        cap.release()`;

/** ProPainter's own `inference_propainter.py` calls `torchvision.io.read_video`, an API removed in
 *  torchvision 0.24 (deprecated since 0.22) — confirmed live: the PyTorch CPU wheel index has no
 *  torchvision build with a Python 3.14 wheel older than 0.24, so there is no version to pin that both
 *  installs here AND still has this function. Patched in place, idempotently (a no-op once already
 *  patched, including across a setup RE-RUN that skips re-cloning) — this is a real, permanent upstream
 *  incompatibility with any Python 3.14 install, not a one-off flake worth just retrying. */
function patchInferenceScript(): void {
  const scriptPath = path.join(REPO_DIR, "inference_propainter.py");
  if (!fs.existsSync(scriptPath)) return;
  const content = fs.readFileSync(scriptPath, "utf-8");
  if (!content.includes(BROKEN_READ_VIDEO)) return;
  fs.writeFileSync(scriptPath, content.replace(BROKEN_READ_VIDEO, FIXED_READ_VIDEO), "utf-8");
}

/** Provisions the local Python runtime for ProPainter: clones the repo, creates a dedicated venv, and
 *  installs its dependencies (CPU-only PyTorch explicitly, to avoid pulling the much larger default
 *  CUDA-bundled wheel on this GPU-less machine). Does NOT download model weights — ProPainter's own
 *  `inference_propainter.py` does that itself on first real inference run, so duplicating that logic
 *  here would only risk drifting out of sync with upstream. */
export async function runLocalSetup(job: LocalSetupJob) {
  try {
    fs.mkdirSync(MODEL_ROOT, { recursive: true });

    // --- cloning ---
    setStageProgress(job, "cloning", 0);
    if (!fs.existsSync(path.join(REPO_DIR, ".git"))) {
      await runStep(job, "git", ["clone", "--depth", "1", "https://github.com/sczhou/ProPainter", REPO_DIR]);
    }
    patchInferenceScript();
    setStageProgress(job, "cloning", 1);
    if (job.abortController.signal.aborted) throw new ApiError(499, "Cancelled", "cancelled");

    // --- venv ---
    setStageProgress(job, "venv", 0);
    if (!fs.existsSync(VENV_PYTHON)) {
      await runStep(job, "python", ["-m", "venv", VENV_DIR]);
    }
    setStageProgress(job, "venv", 1);
    if (job.abortController.signal.aborted) throw new ApiError(499, "Cancelled", "cancelled");

    // --- installing --- (slowest stage — most of the progress range)
    setStageProgress(job, "installing", 0);
    await runStep(job, VENV_PYTHON, ["-m", "pip", "install", "--upgrade", "pip"]);
    setStageProgress(job, "installing", 0.15);
    // Explicit CPU wheel index — a bare `pip install torch` on Windows defaults to a CUDA-bundled
    // wheel several times larger than the CPU-only build, wasted download with no GPU to use it.
    await runStep(job, VENV_PYTHON, ["-m", "pip", "install", "torch", "torchvision", "--index-url", "https://download.pytorch.org/whl/cpu"]);
    setStageProgress(job, "installing", 0.6);
    // torch/torchvision are already installed satisfying requirements.txt's own `>=` constraints, so
    // pip won't reinstall (and re-download) them from this second call.
    await runStep(job, VENV_PYTHON, ["-m", "pip", "install", "-r", "requirements.txt"], { cwd: REPO_DIR });
    setStageProgress(job, "installing", 1);
    if (job.abortController.signal.aborted) throw new ApiError(499, "Cancelled", "cancelled");

    // --- finalizing ---
    setStageProgress(job, "finalizing", 0);
    fs.writeFileSync(SETUP_MARKER, "");
    setStageProgress(job, "finalizing", 1);

    job.status = "done";
    job.progress = 1;
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : undefined;
    job.status = code === "cancelled" ? "cancelled" : "failed";
    if (job.status === "failed") job.error = err instanceof Error ? err.message : String(err);
  } finally {
    job.currentProcess = null;
    job.notify();
  }
}
