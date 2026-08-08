import React from "react";
import {
  Layers,
  UserCheck,
  Box,
  Share2,
  Plus,
  Camera,
} from "lucide-react";
import { LoomGameEngine } from "../loom/gameEngine";

interface HierarchyPanelProps {
  engine: LoomGameEngine;
  selectedEntityName: string | null;
  onSelectEntity: (name: string | null) => void;
  onAddEntity: () => void;
  onSetCameraFollow: (name: string | null) => void;
}

export const HierarchyPanel: React.FC<HierarchyPanelProps> = ({
  engine,
  selectedEntityName,
  onSelectEntity,
  onAddEntity,
  onSetCameraFollow,
}) => {
  const world = engine.activeWorld;
  const entities = world ? Array.from(world.entities.values()).filter((e) => e.name !== "Input") : [];
  const relations = world ? world.relations : [];

  return (
    <div className="w-full bg-slate-900 flex flex-col h-full select-none shrink-0 text-slate-300 overflow-hidden">
      {/* Header */}
      <div className="h-10 px-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-xs uppercase tracking-wider text-slate-200">
            Hierarchy
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddEntity}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition"
            title="Add Entity or Agent"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Entity List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1">
          World Entities & Agents ({entities.length})
        </div>

        {entities.length === 0 ? (
          <div className="text-[11px] text-slate-500 italic p-3 text-center">
            No entities in world yet. Click + to add one.
          </div>
        ) : (
          entities.map((e) => {
            const isSelected = selectedEntityName === e.name;
            return (
              <div
                key={e.name}
                onClick={() => {
                  engine.selectedEntityName = isSelected ? null : e.name;
                  onSelectEntity(isSelected ? null : e.name);
                  engine.render();
                }}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                  isSelected
                    ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 font-semibold"
                    : "hover:bg-slate-800 text-slate-300 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: e.fields.color || (e.isAgent ? "#EC4899" : "#00F2FE") }}
                  />
                  {e.isAgent ? (
                    <UserCheck className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  ) : (
                    <Box className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  )}
                  <span className="truncate">{e.name}</span>
                </div>

                <div className="flex items-center gap-1">
                  {e.isAgent && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-pink-500/20 text-pink-300 font-bold border border-pink-500/30">
                      AGENT
                    </span>
                  )}
                  <button
                    onClick={(evt) => {
                      evt.stopPropagation();
                      onSetCameraFollow(e.name);
                    }}
                    className={`p-1 rounded hover:bg-slate-700 transition ${
                      engine.getCameraFollowTarget() === e.name ? "text-cyan-400" : "text-slate-500"
                    }`}
                    title="Camera Follow This Entity"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Relations Section */}
        {relations.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1 flex items-center gap-1.5">
              <Share2 className="w-3 h-3 text-cyan-400" />
              <span>Entity Relations ({relations.length})</span>
            </div>
            <div className="space-y-1 mt-1">
              {relations.map((r, idx) => (
                <div
                  key={idx}
                  className="px-2.5 py-1 rounded bg-slate-950/40 border border-slate-800/50 text-[11px] font-mono text-slate-400 flex items-center gap-1.5"
                >
                  <span className="text-cyan-300 font-semibold">{r.subject}</span>
                  <span className="text-amber-400 font-bold">{r.verb}</span>
                  <span className="text-emerald-300 font-semibold">{r.object}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
