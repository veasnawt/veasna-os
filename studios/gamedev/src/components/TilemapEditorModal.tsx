import React, { useState } from "react";
import { Grid3X3, X, Trash2, Check, RotateCcw } from "lucide-react";
import { TILE_TYPES, type TileMapData } from "../loom/gameEngine";

interface TilemapEditorModalProps {
  tileMap: TileMapData;
  onSaveTileMap: (newMap: TileMapData) => void;
  onClose: () => void;
}

export const TilemapEditorModal: React.FC<TilemapEditorModalProps> = ({
  tileMap,
  onSaveTileMap,
  onClose,
}) => {
  const [selectedTileId, setSelectedTileId] = useState<number>(1);
  const [grid, setGrid] = useState<number[][]>(() =>
    tileMap.grid.map((row) => [...row])
  );

  const handleCellClick = (r: number, c: number) => {
    const newGrid = grid.map((row, ri) =>
      row.map((cell, ci) => (ri === r && ci === c ? (cell === selectedTileId ? 0 : selectedTileId) : cell))
    );
    setGrid(newGrid);
  };

  const handleClearMap = () => {
    if (confirm("Clear all tiles from the tilemap?")) {
      setGrid(Array(tileMap.rows).fill(0).map(() => Array(tileMap.cols).fill(0)));
    }
  };

  const handleSave = () => {
    onSaveTileMap({ ...tileMap, grid });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="h-12 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-indigo-400" />
            <span className="font-bold text-sm text-slate-100">Loom Visual Tilemap Painter</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-4 flex flex-col md:flex-row gap-4 overflow-hidden">
          {/* Palette Sidebar */}
          <div className="w-full md:w-48 bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Tile Palette
            </div>
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              {TILE_TYPES.map((tile) => (
                <button
                  key={tile.id}
                  onClick={() => setSelectedTileId(tile.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition ${
                    selectedTileId === tile.id
                      ? "bg-indigo-600 text-white font-bold shadow-md"
                      : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-xs"
                    style={{ backgroundColor: tile.color }}
                  />
                  <span className="capitalize">{tile.name} ({tile.id})</span>
                </button>
              ))}
              <button
                onClick={() => setSelectedTileId(0)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition ${
                  selectedTileId === 0
                    ? "bg-rose-600 text-white font-bold"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                }`}
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Eraser (Empty)</span>
              </button>
            </div>

            <button
              onClick={handleClearMap}
              className="w-full py-1.5 bg-slate-900 hover:bg-rose-950 text-rose-400 border border-rose-900/50 rounded-lg text-xs transition font-medium flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Grid</span>
            </button>
          </div>

          {/* Grid Canvas */}
          <div className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 overflow-auto flex items-center justify-center">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tileMap.cols}, minmax(0, 1fr))` }}>
              {grid.map((row, r) =>
                row.map((cellId, c) => {
                  const tile = cellId ? TILE_TYPES.find((t) => t.id === cellId) : null;
                  return (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => handleCellClick(r, c)}
                      className="w-6 h-6 rounded flex items-center justify-center text-[10px] border transition"
                      style={{
                        backgroundColor: tile ? tile.color : "rgba(15, 23, 42, 0.6)",
                        borderColor: tile ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.05)",
                      }}
                    />
                  );
                })
              )}
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
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-md shadow-indigo-600/20"
          >
            <Check className="w-4 h-4" />
            <span>Apply to Level</span>
          </button>
        </div>
      </div>
    </div>
  );
};
