import React, { useState } from "react";
import {
  X,
  Plus,
  Box,
  UserCheck,
  Shield,
  Coins,
  Flame,
  Check,
} from "lucide-react";
import type { CapabilityDecl } from "../loom/parser";

export interface NewEntityConfig {
  name: string;
  isAgent: boolean;
  color: string;
  width: number;
  height: number;
  capabilities: CapabilityDecl[];
}

interface AddEntityModalProps {
  existingNames: string[];
  onCreateEntity: (config: NewEntityConfig) => void;
  onClose: () => void;
}

const TEMPLATE_PRESETS = [
  {
    id: "standard",
    label: "Generic Object",
    icon: Box,
    color: "#00F2FE",
    isAgent: false,
    width: 32,
    height: 32,
    desc: "Standard 2D game entity with position & size",
  },
  {
    id: "coin",
    label: "Collectible / Coin",
    icon: Coins,
    color: "#FACC15",
    isAgent: false,
    width: 24,
    height: 24,
    desc: "Small item for score or powerup pickups",
  },
  {
    id: "enemy",
    label: "Enemy / Hazard",
    icon: Flame,
    color: "#EF4444",
    isAgent: false,
    width: 32,
    height: 32,
    desc: "Threat entity causing damage or collisions",
  },
  {
    id: "prop",
    label: "Platform / Block",
    icon: Shield,
    color: "#64748B",
    isAgent: false,
    width: 128,
    height: 32,
    desc: "Solid ground platform or obstacle block",
  },
  {
    id: "agent",
    label: "Autonomous Agent",
    icon: UserCheck,
    color: "#EC4899",
    isAgent: true,
    width: 36,
    height: 36,
    desc: "Agent with perception & control capabilities",
  },
];

const COLOR_SWATCHES = [
  "#00F2FE", // Cyan
  "#EC4899", // Pink
  "#10B981", // Emerald
  "#FACC15", // Amber
  "#8B5CF6", // Purple
  "#EF4444", // Red
  "#3B82F6", // Blue
  "#64748B", // Slate
];

export const AddEntityModal: React.FC<AddEntityModalProps> = ({
  existingNames,
  onCreateEntity,
  onClose,
}) => {
  // Generate unique default name
  const getDefaultName = () => {
    let count = 1;
    while (existingNames.includes(`Entity_${count}`)) {
      count++;
    }
    return `Entity_${count}`;
  };

  const [name, setName] = useState<string>(getDefaultName());
  const [selectedTemplate, setSelectedTemplate] = useState<string>("standard");
  const [isAgent, setIsAgent] = useState<boolean>(false);
  const [color, setColor] = useState<string>("#00F2FE");
  const [width, setWidth] = useState<number>(32);
  const [height, setHeight] = useState<number>(32);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleSelectTemplate = (tpl: typeof TEMPLATE_PRESETS[0]) => {
    setSelectedTemplate(tpl.id);
    setIsAgent(tpl.isAgent);
    setColor(tpl.color);
    setWidth(tpl.width);
    setHeight(tpl.height);

    // Auto update name prefix if name wasn't heavily customized
    if (name.startsWith("Entity_") || name.startsWith("Coin_") || name.startsWith("Enemy_") || name.startsWith("Block_") || name.startsWith("Agent_")) {
      const prefix = tpl.id === "coin" ? "Coin" : tpl.id === "enemy" ? "Enemy" : tpl.id === "prop" ? "Block" : tpl.id === "agent" ? "Agent" : "Entity";
      let count = 1;
      while (existingNames.includes(`${prefix}_${count}`)) {
        count++;
      }
      setName(`${prefix}_${count}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().replace(/[^a-zA-Z0-9_]/g, "");

    if (!cleanName) {
      setErrorMsg("Please enter a valid entity name.");
      return;
    }

    if (existingNames.includes(cleanName)) {
      setErrorMsg(`An entity named '${cleanName}' already exists.`);
      return;
    }

    onCreateEntity({
      name: cleanName,
      isAgent,
      color,
      width: Math.max(8, width),
      height: Math.max(8, height),
      capabilities: isAgent
        ? [{ verb: "read", target: "Player" }, { verb: "act", target: null }]
        : [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="h-13 px-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-pink-500 flex items-center justify-center shadow-md">
              <Plus className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-slate-100">Create New Entity</div>
              <div className="text-[10px] text-slate-400 font-mono tracking-wider">
                LOOM ENGINE STUDIO
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Quick Preset Templates */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Select Preset Template
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEMPLATE_PRESETS.map((tpl) => {
                const Icon = tpl.icon;
                const isSelected = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tpl)}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col items-start gap-1 relative ${
                      isSelected
                        ? "bg-slate-800 border-cyan-500 text-white shadow-lg shadow-cyan-500/10"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 w-full justify-between">
                      <Icon className="w-4 h-4" style={{ color: tpl.color }} />
                      {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <span className="text-xs font-bold truncate mt-1">{tpl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Entity Identifier Name</span>
              <span className="text-[10px] text-slate-500 font-mono">Unique variable name</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrorMsg("");
              }}
              placeholder="e.g. Shield_1, Coin_A, EnemyBoss"
              className="w-full bg-slate-950 text-slate-100 font-mono text-sm p-3 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 transition"
              autoFocus
            />
            {errorMsg && (
              <p className="text-xs text-rose-400 font-medium font-mono">{errorMsg}</p>
            )}
          </div>

          {/* Entity Type Toggle & Swatches */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Entity Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Entity Nature
              </label>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAgent(false)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    !isAgent
                      ? "bg-slate-800 text-cyan-400 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Box className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Object</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAgent(true)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    isAgent
                      ? "bg-slate-800 text-pink-400 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 text-pink-400" />
                  <span>Agent</span>
                </button>
              </div>
            </div>

            {/* Color Swatches */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Appearance Color
              </label>
              <div className="flex items-center gap-1.5">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    className={`w-7 h-7 rounded-lg transition transform hover:scale-110 flex items-center justify-center ${
                      color === swatch ? "ring-2 ring-white scale-105" : "opacity-80 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Size Dimensions */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Bounding Dimensions (px)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 font-mono block mb-1">Width</label>
                <input
                  type="number"
                  min="8"
                  max="1024"
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value) || 32)}
                  className="w-full bg-slate-950 text-slate-100 font-mono text-xs p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 font-mono block mb-1">Height</label>
                <input
                  type="number"
                  min="8"
                  max="1024"
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value) || 32)}
                  className="w-full bg-slate-950 text-slate-100 font-mono text-xs p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-400 hover:to-pink-400 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create Entity</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
