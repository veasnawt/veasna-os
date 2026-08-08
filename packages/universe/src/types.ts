export type ShellMode = "3d" | "list";

export type TaskbarAlignment = "left" | "center";

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OpenWindow {
  body: CelestialBody;
  minimized: boolean;
  maximized: boolean;
  z: number;
  rect: WindowRect;
  preMaximizeRect?: WindowRect;
}

export type StudioId =
  | "rixie"
  | "bp"
  | "art"
  | "music"
  | "gamedev"
  | "memory"
  | "language"
  | "settings";

export interface MoonData {
  name: string;
  color: string;
  size: number;
  orbitRadius: number;
  orbitSpeed: number;
}

export interface CelestialBody {
  id: StudioId;
  name: string;
  subtitle: string;
  description: string;
  color: string;
  glowColor: string;
  size: number;
  orbitRadius: number;
  orbitSpeed: number;
  rotationSpeed: number;
  position: [number, number, number];
  hasRing?: boolean;
  ringColor?: string;
  ringRadius?: number;
  moons?: MoonData[];
  details: string[];
  launchUrl?: string;
}

export interface MemoryNode {
  id: string;
  content: string;
  category: string;
  timestamp: string;
  confidence: number;
}

export interface StudioBlueprint {
  id: string;
  title: string;
  stage: "Scripting" | "Storyboarding" | "Rendering" | "Ready";
  duration: string;
  tags: string[];
}

export interface ArtToken {
  name: string;
  value: string;
  type: "color" | "blur" | "gradient" | "shadow";
}
