import React, { useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Download,
  Zap,
  Grid3X3,
  Paintbrush,
  Maximize2,
  Save,
  FolderOpen,
  Pencil,
  ArrowLeft,
  Check,
  Image as ImageIcon,
} from "lucide-react";
import { GAME_PRESETS, type GamePreset } from "../loom/presets";

interface HeaderProps {
  projectName: string;
  onRenameProject: (name: string) => void;
  currentPresetId: string;
  onSelectPreset: (preset: GamePreset) => void;
  isRunning: boolean;
  onTogglePlay: () => void;
  onStep: () => void;
  onReset: () => void;
  timeScale: number;
  onChangeTimeScale: (scale: number) => void;
  debugMode: boolean;
  onToggleDebug: () => void;
  muted: boolean;
  onToggleMute: () => void;
  worldWidth: number;
  worldHeight: number;
  onOpenCanvasSize: () => void;
  onOpenTilemap: () => void;
  onOpenSpriteStudio: () => void;
  onOpenBackground: () => void;
  onOpenExport: () => void;
  onOpenDoc: () => void;
  onAddEntity: () => void;
  onSaveProject: () => void;
  onLoadProject: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBackToLanding?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  projectName,
  onRenameProject,
  currentPresetId,
  onSelectPreset,
  isRunning,
  onTogglePlay,
  onStep,
  onReset,
  timeScale,
  onChangeTimeScale,
  worldWidth,
  worldHeight,
  onOpenCanvasSize,
  onOpenTilemap,
  onOpenSpriteStudio,
  onOpenBackground,
  onOpenExport,
  onSaveProject,
  onLoadProject,
  onBackToLanding,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <header className="h-14 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md px-4 flex items-center justify-between gap-4 select-none shrink-0 z-30">
      {/* Brand & Editable Project Name & Preset Selection */}
      <div className="flex items-center gap-3">
        {onBackToLanding && (
          <button
            onClick={onBackToLanding}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition"
            title="Return to Landing Page"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Landing</span>
          </button>
        )}

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-5 h-5 text-white" />
          </div>

          {/* Click to Edit Project Title */}
          <div className="flex items-center gap-1.5">
            {isEditingTitle ? (
              <input
                type="text"
                value={projectName}
                onChange={(e) => onRenameProject(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                autoFocus
                className="bg-slate-800 text-white font-extrabold text-sm px-2 py-0.5 rounded border border-cyan-500 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => setIsEditingTitle(true)}
                className="flex items-center gap-1.5 font-extrabold text-base tracking-tight text-white hover:text-cyan-300 transition group"
                title="Click to rename your project"
              >
                <span>{projectName}</span>
                <Pencil className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 opacity-60 group-hover:opacity-100 transition" />
              </button>
            )}

            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 text-[10px] font-mono font-semibold" title="All edits are continuously auto-saved to local storage">
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="hidden sm:inline">Auto-Saved</span>
            </div>
          </div>
        </div>

        {/* Preset Selector */}
        <div className="h-6 w-px bg-slate-800 mx-1" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-medium hidden md:block">Preset:</label>
          <select
            value={currentPresetId}
            onChange={(e) => {
              const preset = GAME_PRESETS.find((p) => p.id === e.target.value);
              if (preset) onSelectPreset(preset);
            }}
            className="bg-slate-800 text-cyan-400 text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {GAME_PRESETS.map((p) => (
              <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center Playback Simulation Controls */}
      <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1 rounded-2xl border border-slate-800 shadow-inner">
        <button
          onClick={onTogglePlay}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition shadow-md ${
            isRunning
              ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20"
              : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20"
          }`}
        >
          {isRunning ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950" />}
          <span>{isRunning ? "Pause" : "Play"}</span>
        </button>

        <button
          onClick={onStep}
          disabled={isRunning}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition"
          title="Single Step (16ms)"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <button
          onClick={onReset}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
          title="Reset Simulation State"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Speed Multiplier Dropdown */}
        <select
          value={timeScale}
          onChange={(e) => onChangeTimeScale(parseFloat(e.target.value))}
          className="bg-slate-800 text-xs font-mono font-bold text-cyan-300 px-2 py-1 rounded border border-slate-700 focus:outline-none"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1.0x</option>
          <option value={2}>2.0x</option>
          <option value={5}>5.0x</option>
        </select>
      </div>

      {/* Right Toolbar & Quick Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenCanvasSize}
          className="flex items-center gap-1 text-xs text-slate-300 hover:text-cyan-300 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition"
          title="Change Canvas Width & Height"
        >
          <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden lg:inline font-mono">{worldWidth}×{worldHeight}</span>
        </button>

        <button
          onClick={onOpenTilemap}
          className="flex items-center gap-1 text-xs text-slate-300 hover:text-cyan-300 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition"
          title="Open 2D Tilemap Grid Editor"
        >
          <Grid3X3 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden lg:inline">Tilemap</span>
        </button>

        <button
          onClick={onOpenSpriteStudio}
          className="flex items-center gap-1 text-xs text-slate-300 hover:text-cyan-300 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition"
          title="Open Sprite & Color Painter"
        >
          <Paintbrush className="w-3.5 h-3.5 text-pink-400" />
          <span className="hidden lg:inline">Sprite Studio</span>
        </button>

        <button
          onClick={onOpenBackground}
          className="flex items-center gap-1 text-xs text-slate-300 hover:text-cyan-300 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition"
          title="Set World Background Image"
        >
          <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden lg:inline">Background</span>
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Save & Load Unified Project */}
        <button
          onClick={onSaveProject}
          className="flex items-center gap-1 text-xs font-bold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm transition"
          title="Save Unified Project File (.loomproj)"
        >
          <Save className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Save</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs font-bold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm transition"
          title="Open Saved Project (.loomproj / .loom)"
        >
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Open</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".loomproj,.loom,.json"
          onChange={onLoadProject}
          className="hidden"
        />

        <button
          onClick={onOpenExport}
          className="flex items-center gap-1 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 px-3 py-1.5 rounded-xl shadow-md transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>
    </header>
  );
};
