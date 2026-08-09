export interface CatalogApp {
  /** winget's own package identifier — passed straight to `winget install --id <id> -e`. */
  wingetId: string;
  name: string;
  description: string;
  color: string;
}

/** A small, deliberately curated set of well-known, safe packages — not a general winget search
 *  UI. Installing arbitrary/unknown winget IDs on the user's real machine from a chat-adjacent
 *  desktop surface is a meaningfully bigger trust decision than picking from a short vetted list;
 *  this stays scoped to names a user would recognize and trust on sight. */
export const INSTALL_SOFTWARE_CATALOG: CatalogApp[] = [
  { wingetId: "Microsoft.VisualStudioCode", name: "VS Code", description: "Code editor", color: "#38bdf8" },
  { wingetId: "Google.Chrome", name: "Chrome", description: "Web browser", color: "#f87171" },
  { wingetId: "Mozilla.Firefox", name: "Firefox", description: "Web browser", color: "#fb923c" },
  { wingetId: "VideoLAN.VLC", name: "VLC", description: "Media player", color: "#fb923c" },
  { wingetId: "7zip.7zip", name: "7-Zip", description: "File archiver", color: "#facc15" },
  { wingetId: "Notepad++.Notepad++", name: "Notepad++", description: "Text editor", color: "#4ade80" },
  { wingetId: "Discord.Discord", name: "Discord", description: "Chat & voice", color: "#a78bfa" },
  { wingetId: "Spotify.Spotify", name: "Spotify", description: "Music streaming", color: "#34d399" },
  { wingetId: "Valve.Steam", name: "Steam", description: "Game platform", color: "#60a5fa" },
  { wingetId: "Git.Git", name: "Git", description: "Version control", color: "#f87171" },
];
