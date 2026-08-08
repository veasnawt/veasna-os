import React from "react";
import {
  Sparkles,
  Play,
  Plus,
  FolderOpen,
  Boxes,
  Zap,
  Bot,
  Grid,
  Palette,
  Gamepad2,
  ArrowRight,
  BookOpen,
  Layers,
} from "lucide-react";
import { GAME_PRESETS, type GamePreset } from "../loom/presets";

interface LandingPageProps {
  onEnterStudio: (preset?: GamePreset) => void;
  onLoadProjectFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenDoc: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterStudio,
  onLoadProjectFile,
  onOpenDoc,
}) => {
  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-y-auto overflow-x-hidden relative">
      {/* Ambient Radial Gradient Background Glows */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-pink-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-1/3 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      {/* Top Navbar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between border-b border-slate-800/60 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-emerald-400 to-pink-500 p-0.5 shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Boxes className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-emerald-300 to-pink-400">
              LOOM ENGINE 2.0
            </div>
            <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
              Agentic Game Studio
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={onOpenDoc}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 border border-slate-800 transition"
          >
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <span>Documentation</span>
          </button>

          <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition shadow-lg">
            <FolderOpen className="w-4 h-4 text-amber-400" />
            <span>Open Project</span>
            <input
              type="file"
              accept=".loomproj,.loom,.json"
              onChange={onLoadProjectFile}
              className="hidden"
            />
          </label>

          <button
            onClick={() => onEnterStudio(GAME_PRESETS[0])}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-500 via-emerald-500 to-pink-500 text-slate-950 shadow-xl shadow-cyan-500/25 hover:opacity-95 hover:scale-105 active:scale-95 transition transform"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            <span>OPEN STUDIO</span>
          </button>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 pt-12 pb-20 flex flex-col gap-16">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 pt-6">
          {/* Left Column: Hero Text */}
          <div className="flex-1 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-semibold backdrop-blur-md shadow-inner">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>Next-Gen Reactive Game Engine & Agentic Simulator</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.15]">
              Build Dynamic <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-emerald-400 to-pink-500">
                2D Games & AI Worlds
              </span> <br />
              With Loom DSL
            </h1>

            <p className="text-slate-400 text-sm sm:text-base max-w-xl leading-relaxed mx-auto lg:mx-0">
              Loom Studio is a high-performance 2D game engine built around declarative reactive state rules, built-in autonomous AI agents, interactive tilemaps, and real-time inspector tools.
            </p>

            {/* Call to Actions */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2">
              <button
                onClick={() => onEnterStudio(GAME_PRESETS[0])}
                className="flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-emerald-500 to-pink-500 text-slate-950 font-black text-sm shadow-2xl shadow-cyan-500/30 hover:scale-105 active:scale-95 transition transform"
              >
                <Plus className="w-5 h-5" />
                <span>START NEW PROJECT</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>

              <button
                onClick={() => onEnterStudio(GAME_PRESETS[2])} // Platformer Odyssey
                className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-sm border border-slate-700 shadow-xl transition"
              >
                <Gamepad2 className="w-5 h-5 text-emerald-400" />
                <span>Launch Demo Game</span>
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-800/80 max-w-md mx-auto lg:mx-0">
              <div>
                <div className="text-xl font-extrabold text-cyan-400">60 FPS</div>
                <div className="text-[11px] text-slate-400">WebGL / 2D Canvas</div>
              </div>
              <div>
                <div className="text-xl font-extrabold text-emerald-400">Reactive DSL</div>
                <div className="text-[11px] text-slate-400">Intent & When Rules</div>
              </div>
              <div>
                <div className="text-xl font-extrabold text-pink-400">AI Agents</div>
                <div className="text-[11px] text-slate-400">Capability Guarded</div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual Card Mockup */}
          <div className="flex-1 w-full max-w-lg lg:max-w-none">
            <div className="relative rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl p-4 backdrop-blur-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 via-transparent to-pink-500/10 opacity-50 group-hover:opacity-100 transition" />

              {/* Fake Window Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="text-[11px] font-mono text-slate-400 ml-2">
                    PlatformerWorld.loom
                  </span>
                </div>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                  REACTIVE READY
                </span>
              </div>

              {/* Code Snippet Highlight */}
              <div className="bg-slate-950 rounded-2xl p-4 font-mono text-xs text-slate-300 leading-relaxed border border-slate-800/80 shadow-inner overflow-x-auto">
                <div className="text-purple-400 font-bold">
                  world <span className="text-cyan-300">MyGame</span> &#123;
                </div>
                <div className="pl-4 text-emerald-400 font-semibold mt-1">
                  entity <span className="text-pink-400">Player</span> &#123; x: 380, y: 280, hp: 100 &#125;
                </div>
                <div className="pl-4 text-emerald-400 font-semibold">
                  agent <span className="text-amber-300">Rixie</span> &#123; behavior: "Patrol" &#125;
                </div>
                <div className="pl-4 text-blue-400 mt-2">
                  when <span className="text-slate-200">Input.keyRight</span> &#123;
                </div>
                <div className="pl-8 text-cyan-300">Player.vx = 220</div>
                <div className="pl-4 text-blue-400">&#125;</div>
                <div className="pl-4 text-blue-400 mt-1">
                  when <span className="text-slate-200">Player collides StarGoal</span> &#123;
                </div>
                <div className="pl-8 text-amber-300">Player.say("VICTORY!")</div>
                <div className="pl-4 text-blue-400">&#125;</div>
                <div className="text-purple-400 font-bold">&#125;</div>
              </div>
            </div>
          </div>
        </div>

        {/* Preset Selection Gallery */}
        <div className="space-y-6 pt-8">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <Layers className="w-6 h-6 text-cyan-400" />
                <span>Starter Game Presets</span>
              </h2>
              <p className="text-slate-400 text-xs mt-1">
                Choose a template to jump straight into the Loom Studio editor
              </p>
            </div>

            <button
              onClick={() => onEnterStudio(GAME_PRESETS[0])}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
            >
              <span>View All Presets</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {GAME_PRESETS.map((preset) => (
              <div
                key={preset.id}
                onClick={() => onEnterStudio(preset)}
                className="group relative rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 p-5 cursor-pointer transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-cyan-500/10 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-cyan-400 bg-cyan-950/80 px-2.5 py-1 rounded-full border border-cyan-800">
                      {preset.category}
                    </span>
                    <Play className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:scale-110 transition" />
                  </div>

                  <h3 className="text-base font-bold text-slate-100 group-hover:text-cyan-300 transition mb-2">
                    {preset.name}
                  </h3>

                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                    {preset.description}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800/60 flex items-center justify-between text-xs font-semibold text-slate-300 group-hover:text-white">
                  <span>Launch Preset</span>
                  <ArrowRight className="w-4 h-4 text-cyan-400 transform group-hover:translate-x-1 transition" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Core Engine Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-10">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <Zap className="w-6 h-6 text-amber-400" />
            <h3 className="font-extrabold text-sm text-slate-100">Reactive Loom DSL</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Define state rules with <code className="text-cyan-300 font-mono">when</code> and <code className="text-cyan-300 font-mono">intent</code> statements.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <Bot className="w-6 h-6 text-pink-400" />
            <h3 className="font-extrabold text-sm text-slate-100">AI Agent Sandbox</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create autonomous agents with capability guards and interactive behaviors.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <Grid className="w-6 h-6 text-emerald-400" />
            <h3 className="font-extrabold text-sm text-slate-100">2D Tilemap Painter</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Design grass, brick, spike hazards, doors, and coins directly in grid editor.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <Palette className="w-6 h-6 text-cyan-400" />
            <h3 className="font-extrabold text-sm text-slate-100">Sprite & Export Tools</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Customize entity color palettes and export projects as stand-alone HTML5 apps.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500 font-mono shrink-0">
        Loom Engine 2.0 — Powered by Google Antigravity Agentic Studio & Canvas 2D
      </footer>
    </div>
  );
};
