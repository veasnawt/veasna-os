import React from "react";
import { Sliders, ShieldCheck, Camera, Trash2, Plus, Image as ImageIcon, X } from "lucide-react";
import { LoomGameEngine } from "../loom/gameEngine";
import type { WorldEntity } from "../loom/interpreter";

interface InspectorPanelProps {
  engine: LoomGameEngine;
  selectedEntityName: string | null;
  onSelectEntity: (name: string | null) => void;
  onStateChange: () => void;
  onUpdateEntityInCode: (entityName: string, entityObj: WorldEntity | null) => void;
  onOpenSpriteStudio: () => void;
  onSetCameraFollow: (name: string | null) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  engine,
  selectedEntityName,
  onSelectEntity,
  onStateChange,
  onUpdateEntityInCode,
  onOpenSpriteStudio,
  onSetCameraFollow,
}) => {
  const world = engine.activeWorld;
  const entity: WorldEntity | null =
    world && selectedEntityName ? world.entities.get(selectedEntityName) || null : null;

  if (!entity) {
    return (
      <div className="w-full bg-slate-900 flex flex-col h-full select-none shrink-0 p-4 text-slate-500 justify-center items-center text-center overflow-hidden">
        <Sliders className="w-8 h-8 text-slate-700 mb-2" />
        <div className="text-xs font-medium text-slate-400">No Entity Selected</div>
        <div className="text-[11px] text-slate-600 mt-1">
          Click an object on the 2D canvas or in the Hierarchy tree to inspect and edit its Loom state.
        </div>
      </div>
    );
  }

  const fields = entity.fields;

  const handleFieldChange = (key: string, value: any) => {
    fields[key] = value;
    onStateChange();
    onUpdateEntityInCode(entity.name, entity);
    engine.render();
  };

  const handleAddField = () => {
    const key = prompt("Enter new field name (e.g. speed, power, score):");
    if (key && !fields.hasOwnProperty(key)) {
      fields[key] = 0;
      onStateChange();
      onUpdateEntityInCode(entity.name, entity);
      engine.render();
    }
  };

  const handleDeleteEntity = () => {
    if (confirm(`Delete entity '${entity.name}' from Loom world?`)) {
      const name = entity.name;
      world?.entities.delete(name);
      engine.selectedEntityName = null;
      onSelectEntity(null);
      onStateChange();
      onUpdateEntityInCode(name, null);
      engine.render();
    }
  };

  const handleRemoveSprite = () => {
    delete fields.sprite;
    onStateChange();
    onUpdateEntityInCode(entity.name, entity);
    engine.render();
  };

  const isCameraTarget = engine.getCameraFollowTarget() === entity.name;

  const toggleCameraFollow = () => {
    onSetCameraFollow(isCameraTarget ? null : entity.name);
  };

  return (
    <div className="w-full bg-slate-900 flex flex-col h-full select-none shrink-0 text-slate-300 overflow-hidden">
      {/* Inspector Header */}
      <div className="h-10 px-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-xs uppercase tracking-wider text-slate-200 truncate">
            Inspector: {entity.name}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleCameraFollow}
            className={`p-1 rounded text-xs transition ${
              isCameraTarget
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
            title={isCameraTarget ? "Camera Following Entity" : "Track Entity with Camera"}
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteEntity}
            className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
            title="Delete Entity"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Fields Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Basic Meta */}
        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Type:</span>
            <span
              className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded ${
                entity.isAgent
                  ? "bg-pink-950 text-pink-300 border border-pink-800"
                  : "bg-cyan-950 text-cyan-300 border border-cyan-800"
              }`}
            >
              {entity.isAgent ? "Agent" : "Entity"}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Color:</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={fields.color || "#00F2FE"}
                onChange={(e) => handleFieldChange("color", e.target.value)}
                className="w-6 h-6 rounded bg-transparent cursor-pointer border border-slate-700"
              />
              <span className="font-mono text-slate-300 text-[11px]">{fields.color || "#00F2FE"}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Sprite:</span>
            <div className="flex items-center gap-2">
              {typeof fields.sprite === "string" && fields.sprite ? (
                <>
                  <img
                    src={fields.sprite}
                    alt={`${entity.name} sprite`}
                    className="w-6 h-6 rounded object-cover border border-slate-700 bg-slate-950"
                  />
                  <button
                    onClick={onOpenSpriteStudio}
                    className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    Change
                  </button>
                  <button
                    onClick={handleRemoveSprite}
                    className="p-0.5 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition"
                    title="Remove Sprite (revert to flat color)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={onOpenSpriteStudio}
                  className="flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Give it a Sprite...</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Capabilities List (If Agent) */}
        {entity.isAgent && (
          <div className="bg-pink-950/20 p-2.5 rounded-xl border border-pink-900/40 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-pink-300">
              <ShieldCheck className="w-4 h-4 text-pink-400" />
              <span>Agent Capabilities ({entity.capabilities.length})</span>
            </div>
            {entity.capabilities.length === 0 ? (
              <div className="text-[11px] text-pink-400/60 italic">No declared capabilities.</div>
            ) : (
              <div className="space-y-1">
                {entity.capabilities.map((cap, i) => (
                  <div
                    key={i}
                    className="text-[11px] font-mono bg-slate-900/80 px-2 py-1 rounded text-pink-200 border border-pink-900/30 flex items-center justify-between"
                  >
                    <span className="font-bold uppercase text-pink-400">{cap.verb}</span>
                    <span>{cap.target || "*"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Entity Fields Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              State Fields ({Object.keys(fields).length})
            </span>
            <button
              onClick={handleAddField}
              className="text-[11px] flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium"
            >
              <Plus className="w-3 h-3" /> Field
            </button>
          </div>

          <div className="space-y-2">
            {Object.entries(fields).map(([key, val]) => {
              if (key === "color" || key === "sprite") return null;

              const isNumber = typeof val === "number";
              const isBoolean = typeof val === "boolean";

              return (
                <div
                  key={key}
                  className="bg-slate-950/40 p-2 rounded-lg border border-slate-800 flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-mono text-cyan-300 font-medium truncate w-24">
                    {key}
                  </span>

                  {isBoolean ? (
                    <input
                      type="checkbox"
                      checked={val}
                      onChange={(e) => handleFieldChange(key, e.target.checked)}
                      className="accent-cyan-400 cursor-pointer w-4 h-4 rounded"
                    />
                  ) : isNumber ? (
                    <input
                      type="number"
                      value={val}
                      onChange={(e) => handleFieldChange(key, parseFloat(e.target.value) || 0)}
                      className="w-28 bg-slate-900 text-slate-100 font-mono text-xs px-2 py-1 rounded border border-slate-700 focus:outline-none focus:border-cyan-500 text-right"
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(val)}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      className="w-28 bg-slate-900 text-slate-100 font-mono text-xs px-2 py-1 rounded border border-slate-700 focus:outline-none focus:border-cyan-500"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
