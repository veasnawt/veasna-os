import React, { useRef, useState } from "react";
import { Image as ImageIcon, X, Check, Trash2 } from "lucide-react";

interface BackgroundModalProps {
  currentBackground?: string | null;
  onApply: (dataUrl: string | null) => void;
  onClose: () => void;
}

export const BackgroundModal: React.FC<BackgroundModalProps> = ({
  currentBackground,
  onApply,
  onClose,
}) => {
  const [preview, setPreview] = useState<string | null>(currentBackground || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => setPreview((event.target?.result as string) || null);
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="h-12 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm text-slate-100">World Background Image</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

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
            className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed border-slate-700 hover:border-emerald-500 text-slate-400 hover:text-emerald-300 transition bg-slate-950/40"
          >
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs font-semibold">Click to choose a background image</span>
            <span className="text-[10px] text-slate-500">Stretched to fill the whole world/canvas area</span>
          </button>
          {error && <div className="text-xs text-rose-400">{error}</div>}
          {preview && (
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="text-[11px] text-slate-400 font-mono">Preview</div>
              <img
                src={preview}
                alt="Background preview"
                className="w-full h-40 object-cover rounded-xl border border-slate-700 shadow-inner bg-slate-950"
              />
            </div>
          )}
        </div>

        <div className="h-14 px-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/60">
          <button
            onClick={() => {
              onApply(null);
              onClose();
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Background</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (preview) onApply(preview);
                onClose();
              }}
              disabled={!preview}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-md shadow-emerald-600/20"
            >
              <Check className="w-4 h-4" />
              <span>Apply Background</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
