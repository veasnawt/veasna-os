import { CelestialBody } from "./types";

export const CELESTIAL_BODIES: CelestialBody[] = [
  {
    id: "rixie",
    name: "Rixie Core",
    subtitle: "The Guiding Star & Intelligent Cosmic Heart",
    description: "Central pulse orchestrating spatial memory, multi-model reasoning, autonomous agents & local tools.",
    color: "#38bdf8",
    glowColor: "#0284c7",
    size: 2.0,
    orbitRadius: 0,
    orbitSpeed: 0,
    rotationSpeed: 0.005,
    position: [0, 0, 0],
    hasRing: true,
    ringColor: "#38bdf8",
    ringRadius: 3.2,
    details: [
      "Local-First Intelligence Engine",
      "SQLite Long-term Knowledge Vault",
      "Autonomous Agent Orchestration",
      "Empirical Proof & Verification"
    ],
    launchUrl: "http://localhost:3001/agent"
  },
  {
    id: "bp",
    name: "BP Studio",
    subtitle: "Video Production & Blueprint Genesis World",
    description: "Handcrafted Earth-like sphere with lush oceans, pine forests, clouds, and sparkling nocturnal city lights.",
    color: "#0ea5e9",
    glowColor: "#38bdf8",
    size: 1.35,
    orbitRadius: 8.5,
    orbitSpeed: 0.14,
    rotationSpeed: 0.012,
    position: [8.5, 0, 0],
    moons: [
      { name: "Luna BP-1", color: "#94a3b8", size: 0.28, orbitRadius: 2.4, orbitSpeed: 0.8 }
    ],
    details: [
      "Short-form Video Blueprint Generator",
      "Multi-stage Production Pipeline",
      "Script & Storyboard Synthesis",
      "Automated Publishing Telemetry"
    ],
    launchUrl: "http://localhost:3001"
  },
  {
    id: "art",
    name: "Art Studio",
    subtitle: "Visual Design & Ghibli Concept Realm",
    description: "Prismatic Ghibli gas giant with swirling twilight clouds, polar auroras, and crystalline ring systems.",
    color: "#818cf8",
    glowColor: "#6366f1",
    size: 1.5,
    orbitRadius: 14,
    orbitSpeed: 0.09,
    rotationSpeed: 0.015,
    position: [14, 1.2, -3],
    hasRing: true,
    ringColor: "#c084fc",
    ringRadius: 2.5,
    moons: [
      { name: "Iris-A", color: "#e879f9", size: 0.25, orbitRadius: 2.8, orbitSpeed: 0.6 }
    ],
    details: [
      "Glassmorphic Design Tokens",
      "UI Color Palette Synthesis",
      "3D PBR Shader Specs",
      "Visual Aesthetics Engine"
    ]
  },
  {
    id: "music",
    name: "Music Studio",
    subtitle: "Bioluminescent Lagoon & Spatial Audio World",
    description: "Emerald & cyan ocean sphere pulsing with audio frequency wave currents and ambient soundscapes.",
    color: "#10b981",
    glowColor: "#059669",
    size: 1.25,
    orbitRadius: 19.5,
    orbitSpeed: 0.065,
    rotationSpeed: 0.009,
    position: [-19.5, -1, 4],
    hasRing: true,
    ringColor: "#34d399",
    ringRadius: 1.9,
    details: [
      "Ambient Focus Soundscape Synthesizer",
      "Spatial Micro-interaction Audio",
      "Frequency Wave Visualizer",
      "Binaural & Focus Tuning"
    ]
  },
  {
    id: "gamedev",
    name: "Game Dev Studio",
    subtitle: "Loom Engine — Agentic 2D Game Studio",
    description: "Radiant volcanic obsidian world with glowing gold lava fissures, powered by Loom Engine: a reactive 2D game engine with a built-in scripting language and autonomous AI agents.",
    color: "#f59e0b",
    glowColor: "#d97706",
    size: 1.4,
    orbitRadius: 25,
    orbitSpeed: 0.045,
    rotationSpeed: 0.018,
    position: [0, 2.5, -25],
    hasRing: true,
    ringColor: "#fcd34d",
    ringRadius: 2.2,
    moons: [
      { name: "Pyra-X", color: "#fb923c", size: 0.22, orbitRadius: 2.6, orbitSpeed: 0.9 }
    ],
    details: [
      "Loom Scripting Language (lexer, parser, interpreter)",
      "Declarative Reactive State Rules Engine",
      "Sprite Studio & Interactive Tilemap Painter",
      "Built-in Autonomous AI Agent Sandbox"
    ],
    launchUrl: "http://localhost:5173"
  },
  {
    id: "memory",
    name: "SQLite Memory Vault",
    subtitle: "Crystalline Knowledge Constellation",
    description: "Cluster of faceted rose-gold crystals and asteroids storing long-term extracted facts & user context.",
    color: "#f43f5e",
    glowColor: "#e11d48",
    size: 1.1,
    orbitRadius: 30.5,
    orbitSpeed: 0.032,
    rotationSpeed: 0.006,
    position: [24, -3.5, 19],
    hasRing: true,
    ringColor: "#fda4af",
    ringRadius: 1.8,
    details: [
      "SQLite Long-term Memory Vault",
      "Contextual Fact Retrieval",
      "Automated Knowledge Extraction",
      "Studio Filter & Audit Log"
    ]
  },
  {
    id: "language",
    name: "Language Studio",
    subtitle: "Sage Citadel & Amethyst Knowledge World",
    description: "Serene amethyst marble planet surrounded by golden concentric rings of linguistic scrolls and wisdom.",
    color: "#a855f7",
    glowColor: "#7e22ce",
    size: 1.2,
    orbitRadius: 36,
    orbitSpeed: 0.024,
    rotationSpeed: 0.008,
    position: [-30, 2, -20],
    hasRing: true,
    ringColor: "#d8b4fe",
    ringRadius: 2.0,
    details: [
      "Multilingual AI Translator",
      "Grammar & Syntax Analyzer",
      "Linguistic Persona Synthesizer",
      "Vocabulary & Etymology Graph"
    ]
  },
  {
    id: "settings",
    name: "Settings",
    subtitle: "Chronometer Engine & Solis Core",
    description: "Titanium and solar brass chronometer sphere with rotating orbital rings and system telemetry.",
    color: "#64748b",
    glowColor: "#334155",
    size: 1.15,
    orbitRadius: 41.5,
    orbitSpeed: 0.018,
    rotationSpeed: 0.02,
    position: [35, -2, -22],
    hasRing: true,
    ringColor: "#94a3b8",
    ringRadius: 2.1,
    details: [
      "System Performance & Telemetry",
      "Graphics & Render Quality Tuning",
      "Model Provider Configuration",
      "Storage & Database Diagnostics"
    ]
  },
  {
    id: "terminal",
    name: "Terminal",
    subtitle: "Obsidian Command Shard",
    description: "A dark glass-shard asteroid etched with glowing command glyphs — a direct line into the machine underneath the cosmos.",
    color: "#22c55e",
    glowColor: "#16a34a",
    size: 0.95,
    orbitRadius: 46.5,
    orbitSpeed: 0.014,
    rotationSpeed: 0.022,
    position: [-38, 3, 26],
    details: [
      "Real Shell Access (cmd.exe)",
      "Persistent Working Directory",
      "Live Streamed Output",
      "Local Machine Only"
    ]
  },
  {
    id: "browser",
    name: "Browser",
    subtitle: "Wayfarer's Lens",
    description: "A pale, cloud-veiled world ringed with a faint atmospheric halo — a window looking outward from the cosmos to the wider web.",
    color: "#38bdf8",
    glowColor: "#0ea5e9",
    size: 1.0,
    orbitRadius: 52,
    orbitSpeed: 0.012,
    rotationSpeed: 0.016,
    position: [42, -1.5, -30],
    hasRing: true,
    ringColor: "#7dd3fc",
    ringRadius: 1.7,
    details: [
      "Embedded Web Browsing",
      "Address Bar & Search",
      "Back / Forward History",
      "Open-in-New-Tab Fallback"
    ]
  }
];
