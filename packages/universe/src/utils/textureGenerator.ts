/**
 * Procedural canvas-based texture generator for handcrafted celestial planets.
 * Avoids shipping binary texture assets — every map is painted at runtime
 * onto an offscreen <canvas> and wrapped in a THREE.CanvasTexture.
 */
import * as THREE from "three";

export type PlanetType = "bp" | "art" | "music" | "gamedev" | "memory";

interface PlanetPalette {
  base: [string, string];
  bands: string[];
  glow: string;
}

const PALETTES: Record<PlanetType, PlanetPalette> = {
  bp: {
    base: ["#0c4a6e", "#0369a1"],
    bands: ["#14532d", "#166534", "#f8fafc"],
    glow: "#facc15",
  },
  art: {
    base: ["#4c1d95", "#818cf8"],
    bands: ["#c084fc", "#a78bfa", "#f0abfc"],
    glow: "#e879f9",
  },
  music: {
    base: ["#022c22", "#059669"],
    bands: ["#10b981", "#22d3ee", "#a7f3d0"],
    glow: "#5eead4",
  },
  gamedev: {
    base: ["#1c1917", "#292524"],
    bands: ["#f59e0b", "#d97706", "#7c2d12"],
    glow: "#fbbf24",
  },
  memory: {
    base: ["#4c0519", "#e11d48"],
    bands: ["#fda4af", "#fecdd3", "#fff1f2"],
    glow: "#fb7185",
  },
};

function createCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
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

function paintSurface(ctx: CanvasRenderingContext2D, size: number, palette: PlanetPalette, seed: number) {
  const rand = mulberry32(seed);

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, palette.base[0]);
  gradient.addColorStop(1, palette.base[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Swirling latitudinal bands
  const bandCount = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < bandCount; i++) {
    const y = (i / bandCount) * size + (rand() - 0.5) * (size / bandCount) * 0.6;
    const height = size / bandCount * (0.4 + rand() * 0.5);
    ctx.fillStyle = palette.bands[i % palette.bands.length];
    ctx.globalAlpha = 0.18 + rand() * 0.15;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += size / 16) {
      const wobble = Math.sin(x * 0.02 + i) * height * 0.4;
      ctx.lineTo(x, y + wobble);
    }
    ctx.lineTo(size, y + height);
    for (let x = size; x >= 0; x -= size / 16) {
      const wobble = Math.sin(x * 0.02 + i + 1.5) * height * 0.4;
      ctx.lineTo(x, y + height + wobble);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Fine speckled texture (mountains / crystal facets / foam)
  const speckCount = Math.floor(size * size * 0.02);
  for (let i = 0; i < speckCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = rand() * 1.4;
    ctx.fillStyle = palette.bands[Math.floor(rand() * palette.bands.length)];
    ctx.globalAlpha = 0.08 + rand() * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintEmissive(ctx: CanvasRenderingContext2D, size: number, palette: PlanetPalette, seed: number) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);

  const rand = mulberry32(seed + 999);
  const spotCount = Math.floor(size * size * 0.0015);
  for (let i = 0; i < spotCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.6 + rand() * 1.6;
    ctx.fillStyle = palette.glow;
    ctx.globalAlpha = 0.5 + rand() * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintBump(ctx: CanvasRenderingContext2D, size: number, seed: number) {
  const rand = mulberry32(seed + 42);
  const imageData = ctx.createImageData(size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    imageData.data[i] = v;
    imageData.data[i + 1] = v;
    imageData.data[i + 2] = v;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function toTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

const planetTextureCache = new Map<PlanetType, { map: THREE.Texture; bumpMap: THREE.Texture; emissiveMap: THREE.Texture }>();

export function generatePlanetTexture(type: PlanetType): {
  map: THREE.Texture;
  bumpMap: THREE.Texture;
  emissiveMap: THREE.Texture;
} {
  const cached = planetTextureCache.get(type);
  if (cached) return cached;

  const size = 512;
  const palette = PALETTES[type];
  const seed = Array.from(type).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  const surfaceCanvas = createCanvas(size);
  const surfaceCtx = surfaceCanvas.getContext("2d")!;
  paintSurface(surfaceCtx, size, palette, seed);

  const bumpCanvas = createCanvas(size);
  const bumpCtx = bumpCanvas.getContext("2d")!;
  paintBump(bumpCtx, size, seed);

  const emissiveCanvas = createCanvas(size);
  const emissiveCtx = emissiveCanvas.getContext("2d")!;
  paintEmissive(emissiveCtx, size, palette, seed);

  const result = {
    map: toTexture(surfaceCanvas),
    bumpMap: toTexture(bumpCanvas),
    emissiveMap: toTexture(emissiveCanvas),
  };

  planetTextureCache.set(type, result);
  return result;
}

let cloudTextureCache: THREE.Texture | null = null;

export function generateCloudTexture(): THREE.Texture {
  if (cloudTextureCache) return cloudTextureCache;

  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const rand = mulberry32(7);
  const puffCount = 90;
  for (let i = 0; i < puffCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 12 + rand() * 40;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  cloudTextureCache = toTexture(canvas);
  return cloudTextureCache;
}

let rayTextureCache: THREE.Texture | null = null;

/** Soft light-beam texture: bright core fading to transparent at both ends and edges. */
export function generateRayTexture(): THREE.Texture {
  if (rayTextureCache) return rayTextureCache;

  const w = 64;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const lengthGradient = ctx.createLinearGradient(0, 0, 0, h);
  lengthGradient.addColorStop(0, "rgba(255,255,255,0)");
  lengthGradient.addColorStop(0.5, "rgba(255,255,255,1)");
  lengthGradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = lengthGradient;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "destination-in";
  const widthGradient = ctx.createLinearGradient(0, 0, w, 0);
  widthGradient.addColorStop(0, "rgba(255,255,255,0)");
  widthGradient.addColorStop(0.5, "rgba(255,255,255,1)");
  widthGradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = widthGradient;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";

  rayTextureCache = new THREE.CanvasTexture(canvas);
  rayTextureCache.needsUpdate = true;
  return rayTextureCache;
}

const nebulaTextureCache = new Map<string, THREE.Texture>();

/**
 * Soft, amorphous cloud-of-glow texture for a billboard sprite — several
 * overlapping radial-gradient blobs so the silhouette isn't a perfect circle.
 */
export function generateNebulaTexture(hex: string): THREE.Texture {
  const cached = nebulaTextureCache.get(hex);
  if (cached) return cached;

  const size = 512;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const seed = Array.from(hex).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const rand = mulberry32(seed);
  const center = size / 2;

  const blobCount = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < blobCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * size * 0.22;
    const x = center + Math.cos(angle) * dist;
    const y = center + Math.sin(angle) * dist;
    const r = size * (0.22 + rand() * 0.2);

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `${hex}55`);
    gradient.addColorStop(0.5, `${hex}22`);
    gradient.addColorStop(1, `${hex}00`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  nebulaTextureCache.set(hex, texture);
  return texture;
}
