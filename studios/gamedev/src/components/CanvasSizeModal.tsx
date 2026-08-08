import React, { useState } from "react";
import { Maximize2, X, Check } from "lucide-react";

interface CanvasSizeModalProps {
  currentWidth: number;
  currentHeight: number;
  onApplySize: (width: number, height: number) => void;
  onClose: () => void;
}

const PRESET_SIZES = [
  { name: "Classic 4:3", width: 800, height: 600 },
  { name: "Retro HD", width: 1024, height: 768 },
  { name: "720p Widescreen", width: 1280, height: 720 },
  { name: "1080p Full HD", width: 1920, height: 1080 },
  { name: "Square Arena", width: 600, height: 600 },
  { name: "Compact Mobile", width: 400, height: 600 },
];

export const CanvasSizeModal: React.FC<CanvasSizeModalProps> = ({
  currentWidth,
  currentHeight,
  onApplySize,
  onClose,
}) => {
  const [width, setWidth] = useState<number>(currentWidth);
  const [height, setHeight] = useState<number>(currentHeight);

  const handleSave = (w = width, h = height) => {
    const validW = Math.max(200, Math.min(3840, w));
    const validH = Math.max(200, Math.min(2160, h));
    onApplySize(validW, validH);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="h-12 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Maximize2 className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-sm text-slate-100">World Canvas Dimensions</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5">
          {/* Quick Resolution Presets */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Popular Presets
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_SIZES.map((preset) => {
                const isSelected = width === preset.width && height === preset.height;
                return (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setWidth(preset.width);
                      setHeight(preset.height);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col ${
                      isSelected
                        ? "bg-cyan-950/60 border-cyan-500 text-cyan-200"
                        : "bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-xs font-semibold">{preset.name}</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {preset.width} × {preset.height} px
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Width & Height Inputs */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Custom Size (px)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 font-mono block mb-1">Width (px)</label>
                <input
                  type="number"
                  min="200"
                  max="3840"
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value) || 800)}
                  className="w-full bg-slate-950 text-slate-100 font-mono text-xs p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-mono block mb-1">Height (px)</label>
                <input
                  type="number"
                  min="200"
                  max="2160"
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value) || 600)}
                  className="w-full bg-slate-950 text-slate-100 font-mono text-xs p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-14 px-4 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSave(width, height)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-md shadow-cyan-600/20"
          >
            <Check className="w-4 h-4" />
            <span>Apply Dimensions</span>
          </button>
        </div>
      </div>
    </div>
  );
};
