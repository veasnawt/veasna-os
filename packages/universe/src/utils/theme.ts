export type ThemeMode = "dark" | "light" | "glass";

export const THEME_PRESETS: { id: ThemeMode; name: string; description: string }[] = [
  { id: "dark", name: "Dark", description: "Deep space, high contrast" },
  { id: "light", name: "Light", description: "Bright and clean" },
  { id: "glass", name: "Liquid Glass", description: "Frosted, translucent" },
];

export const DEFAULT_THEME: ThemeMode = "dark";
