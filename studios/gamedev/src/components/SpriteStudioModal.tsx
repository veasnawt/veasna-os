import React, { useRef, useState } from "react";
import { Paintbrush, X, Check, RotateCcw, Upload, Image as ImageIcon, Palette } from "lucide-react";

interface SpriteStudioModalProps {
  onClose: () => void;
  /** value is a hex color for kind "color", or a data URL / image URL for kind "sprite". */
  onApply: (value: string, kind: "color" | "sprite") => void;
}

const PALETTE = [
  "#00F2FE", "#38BDF8", "#3B82F6", "#8B5CF6", "#EC4899",
  "#EF4444", "#F59E0B", "#10B981", "#14B8A6", "#FFFFFF",
  "#94A3B8", "#0F172A"
];

const GRID_SIZE = 12;
const CELL_PX = 16; // exported pixel-art image is GRID_SIZE * CELL_PX square

type Tab = "draw" | "upload" | "color";

export const SpriteStudioModal: React.FC<SpriteStudioModalProps> = ({ onClose, onApply }) => {
  const [tab, setTab] = useState<Tab>("draw");

  const [selectedColor, setSelectedColor] = useState<string>("#00F2FE");
  const [pixels, setPixels] = useState<string[][]>(() =>
    Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill("#0F172A"))
  );

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePixelClick = (r: number, c: number) => {
    const next = pixels.map((row, ri) =>
      row.map((col, ci) => (ri === r && ci === c ? selectedColor : col))
    );
    setPixels(next);
  };

  const handleClear = () => {
    setPixels(Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill("#0F172A")));
  };

  const handleUseDrawing = () => {
    const canvas = document.createElement("canvas");
    canvas.width = GRID_SIZE * CELL_PX;
    canvas.height = GRID_SIZE * CELL_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        ctx.fillStyle = pixels[r][c];
        ctx.fillRect(c * CELL_PX, r * CELL_PX, CELL_PX, CELL_PX);
      }
    }
    onApply(canvas.toDataURL("image/png"), "sprite");
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage((event.target?.result as string) || null);
    };
    reader.onerror = () => setUploadError("Couldn't read that file.");
    reader.readAsDataURL(file);
  };

  const handleUseUpload = () => {
    if (!uploadedImage) return;
    onApply(uploadedImage, "sprite");
    onClose();
  };

  const handleUseColor = () => {
    onApply(selectedColor, "color");
    onClose();
  };

  const TabButton: React.FC<{ id: Tab; icon: React.ReactNode; label: string }> = ({ id, icon, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition border-b-2 ${
        tab === id
          ? "text-pink-300 border-pink-500 bg-pink-500/5"
          : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-12 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2">
            <Paintbrush className="w-5 h-5 text-pink-400" />
            <span className="font-bold text-sm text-slate-100">Loom Sprite Studio</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 shrink-0">
          <TabButton id="draw" icon={<Paintbrush className="w-3.5 h-3.5" />} label="Draw Pixel Art" />
          <TabButton id="upload" icon={<Upload className="w-3.5 h-3.5" />} label="Upload Image" />
          <TabButton id="color" icon={<Palette className="w-3.5 h-3.5" />} label="Flat Color" />
        </div>

        {/* Tab Content */}
        {tab === "draw" && (
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-7 h-7 rounded-full border-2 transition transform hover:scale-110 ${
                    selectedColor === color ? "border-white scale-110 shadow-lg" : "border-slate-800"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 shadow-inner">
              <div className="grid grid-cols-12 gap-1">
                {pixels.map((row, r) =>
                  row.map((color, c) => (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => handlePixelClick(r, c)}
                      className="w-6 h-6 rounded border border-slate-800/40 transition hover:opacity-80"
                      style={{ backgroundColor: color }}
                    />
                  ))
                )}
              </div>
            </div>

            <button
              onClick={handleClear}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 self-start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Canvas</span>
            </button>
          </div>
        )}

        {tab === "upload" && (
          <div className="p-6 flex flex-col items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed border-slate-700 hover:border-pink-500 text-slate-400 hover:text-pink-300 transition bg-slate-950/40"
            >
              <ImageIcon className="w-8 h-8" />
              <span className="text-xs font-semibold">Click to choose an image file</span>
              <span className="text-[10px] text-slate-500">PNG, JPG, GIF, WebP -- stretched to fit the entity's box</span>
            </button>
            {uploadError && <div className="text-xs text-rose-400">{uploadError}</div>}
            {uploadedImage && (
              <div className="flex flex-col items-center gap-2">
                <div className="text-[11px] text-slate-400 font-mono">Preview</div>
                <img
                  src={uploadedImage}
                  alt="Sprite preview"
                  className="w-24 h-24 object-cover rounded-xl border border-slate-700 shadow-inner bg-slate-950"
                />
              </div>
            )}
          </div>
        )}

        {tab === "color" && (
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-9 h-9 rounded-full border-2 transition transform hover:scale-110 ${
                    selectedColor === color ? "border-white scale-110 shadow-lg" : "border-slate-800"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="text-xs font-mono text-slate-400">{selectedColor}</div>
          </div>
        )}

        {/* Footer */}
        <div className="h-14 px-4 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-950/60 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
          >
            Cancel
          </button>
          {tab === "draw" && (
            <button
              onClick={handleUseDrawing}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-md shadow-pink-600/20"
            >
              <Check className="w-4 h-4" />
              <span>Use This Drawing</span>
            </button>
          )}
          {tab === "upload" && (
            <button
              onClick={handleUseUpload}
              disabled={!uploadedImage}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-md shadow-pink-600/20"
            >
              <Check className="w-4 h-4" />
              <span>Use This Image</span>
            </button>
          )}
          {tab === "color" && (
            <button
              onClick={handleUseColor}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-md shadow-pink-600/20"
            >
              <Check className="w-4 h-4" />
              <span>Use This Color</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
