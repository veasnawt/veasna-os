/**
 * Procedural desktop wallpapers — deep space gradient + soft nebula blooms +
 * a starfield, matching the same cosmic identity as the 3D universe and the
 * planet textures. Deterministic per preset (seeded), cached, no binary assets.
 */

export interface WallpaperPreset {
  id: string;
  name: string;
  /** [background base, nebula color A, nebula color B] */
  colors: [string, string, string];
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  { id: "nebula-blue", name: "Nebula Blue", colors: ["#050814", "#38bdf8", "#818cf8"] },
  { id: "ocean-depths", name: "Ocean Depths", colors: ["#03101a", "#0ea5e9", "#10b981"] },
  { id: "aurora", name: "Aurora", colors: ["#020e0c", "#10b981", "#38bdf8"] },
  { id: "ember", name: "Ember", colors: ["#140a03", "#f59e0b", "#f43f5e"] },
  { id: "amethyst", name: "Amethyst", colors: ["#0d0616", "#a855f7", "#f43f5e"] },
];

export const DEFAULT_WALLPAPER = WALLPAPER_PRESETS[0].id;

/** Custom (user-uploaded) wallpapers are stored as data: URLs directly, distinguishing them from preset ids. */
export function isCustomWallpaper(value: string): boolean {
  return value.startsWith("data:");
}

/** Resolves any wallpaper value (preset id or custom data URL) to a paintable image URL. */
export function resolveWallpaperUrl(value: string, width = 1920, height = 1080): string {
  if (isCustomWallpaper(value)) return value;
  return generateWallpaper(value, width, height);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, string>();

export function generateWallpaper(presetId: string, width = 1920, height = 1080): string {
  const key = `${presetId}_${width}x${height}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const preset = WALLPAPER_PRESETS.find((p) => p.id === presetId) ?? WALLPAPER_PRESETS[0];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(hashString(preset.id));

  // Deep space base gradient
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, preset.colors[0]);
  bg.addColorStop(1, "#000000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Soft nebula blooms
  const blobColors = [preset.colors[1], preset.colors[2]];
  for (let i = 0; i < 6; i++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const r = width * (0.16 + rand() * 0.26);
    const color = blobColors[i % 2];
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `${color}30`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Starfield
  const starCount = Math.floor((width * height) / 3800);
  for (let i = 0; i < starCount; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = rand() * 1.3;
    ctx.globalAlpha = 0.25 + rand() * 0.65;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Vignette so foreground UI (icons/windows) stays legible at the edges
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.35,
    width / 2,
    height / 2,
    height * 0.85
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/png");
  cache.set(key, dataUrl);
  return dataUrl;
}
