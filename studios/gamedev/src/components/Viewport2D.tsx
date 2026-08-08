import React, { useEffect, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  Target,
  Navigation,
  MousePointer,
  Hand,
  Plus,
} from "lucide-react";
import { LoomGameEngine } from "../loom/gameEngine";
import type { WorldEntity } from "../loom/interpreter";

interface Viewport2DProps {
  engine: LoomGameEngine;
  selectedEntityName: string | null;
  onSelectEntity: (name: string | null) => void;
  onUpdateEntityInCode?: (name: string, entity?: WorldEntity | null) => void;
  isRunning?: boolean;
  onTogglePlay?: () => void;
}

export type ViewportTool = "select" | "pan" | "crosshair" | "spawn";

export const Viewport2D: React.FC<Viewport2DProps> = ({
  engine,
  selectedEntityName,
  onSelectEntity,
  onUpdateEntityInCode,
  isRunning = false,
  onTogglePlay,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [activeTool, setActiveTool] = useState<ViewportTool>("select");
  const [hoveredEntityName, setHoveredEntityName] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(Math.round(engine.camera.zoom * 100));

  const isPanningRef = useRef(false);
  const isDraggingEntityRef = useRef(false);
  const dragEntityNameRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isOffScreen, setIsOffScreen] = useState<boolean>(false);
  const [offScreenTargetName, setOffScreenTargetName] = useState<string>("Player");
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);

  // Sync Zoom state whenever engine camera changes
  const updateZoomState = () => {
    setZoomPercent(Math.round(engine.camera.zoom * 100));
  };

  // 60FPS continuous render loop for layout accuracy & instant initial draw
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    let animFrameId: number;

    const renderLoop = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;

      if (canvas.width !== w || canvas.height !== h || engine.canvas !== canvas || !engine.ctx) {
        canvas.width = w;
        canvas.height = h;
        engine.canvas = canvas;
        engine.ctx = canvas.getContext("2d");
      }

      if (engine.activeWorld && !engine.isBlankCanvas && !engine.activeWorld.entities.has("Player")) {
        engine.ensurePlayerEntity();
      }

      engine.render();

      animFrameId = requestAnimationFrame(renderLoop);
    };

    animFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [engine]);

  // Keyboard Nudge in Pause mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      if (isRunning || !selectedEntityName || !engine.activeWorld) return;

      const ent = engine.activeWorld.entities.get(selectedEntityName);
      if (!ent) return;

      const step = e.shiftKey ? 10 : 1;
      let moved = false;

      if (e.key === "ArrowLeft" || e.code === "KeyA") {
        ent.fields.x = (ent.fields.x || 0) - step;
        moved = true;
      } else if (e.key === "ArrowRight" || e.code === "KeyD") {
        ent.fields.x = (ent.fields.x || 0) + step;
        moved = true;
      } else if (e.key === "ArrowUp" || e.code === "KeyW") {
        ent.fields.y = (ent.fields.y || 0) - step;
        moved = true;
      } else if (e.key === "ArrowDown" || e.code === "KeyS") {
        ent.fields.y = (ent.fields.y || 0) + step;
        moved = true;
      }

      if (moved) {
        e.preventDefault();
        if (onUpdateEntityInCode) onUpdateEntityInCode(selectedEntityName, ent);
        engine.render();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRunning, selectedEntityName, engine, onUpdateEntityInCode]);

  // Off-screen Player Detection
  useEffect(() => {
    const checkOffscreen = () => {
      if (!engine.activeWorld) return;
      const targetName = engine.getCameraFollowTarget() || "Player";
      const targetEnt = engine.activeWorld.entities.get(targetName);

      if (targetEnt && typeof targetEnt.fields.x === "number" && typeof targetEnt.fields.y === "number") {
        const x = targetEnt.fields.x;
        const y = targetEnt.fields.y;

        const off = x < 0 || x > engine.worldWidth || y < 0 || y > engine.worldHeight;
        setIsOffScreen(off);
        setOffScreenTargetName(targetName);
      } else {
        setIsOffScreen(false);
      }
    };

    const interval = setInterval(checkOffscreen, 250);
    return () => clearInterval(interval);
  }, [engine]);

  const handleZoomIn = () => {
    engine.camera.zoom = Math.min(engine.camera.zoom * 1.25, 3.0);
    updateZoomState();
    engine.render();
  };

  const handleZoomOut = () => {
    engine.camera.zoom = Math.max(engine.camera.zoom / 1.25, 0.4);
    updateZoomState();
    engine.render();
  };

  const handleResetCamera = () => {
    engine.camera.x = 0;
    engine.camera.y = 0;
    engine.camera.zoom = 1;
    updateZoomState();
    engine.render();
  };

  const handleFocusPlayer = () => {
    if (!engine.activeWorld) return;
    const targetEnt = engine.activeWorld.entities.get(offScreenTargetName);
    if (targetEnt && typeof targetEnt.fields.x === "number" && typeof targetEnt.fields.y === "number") {
      targetEnt.fields.x = engine.worldWidth / 2 - 16;
      targetEnt.fields.y = engine.worldHeight / 2 - 16;
      if (typeof targetEnt.fields.vx === "number") targetEnt.fields.vx = 0;
      if (typeof targetEnt.fields.vy === "number") targetEnt.fields.vy = 0;

      engine.camera.x = 0;
      engine.camera.y = 0;
      engine.camera.zoom = 1;
      updateZoomState();

      if (onUpdateEntityInCode) {
        onUpdateEntityInCode(offScreenTargetName, targetEnt);
      }
      engine.render();
    }
  };

  const getWorldCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { wx: 0, wy: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const centerX = (canvasRef.current.width / engine.camera.zoom - engine.worldWidth) / 2;
    const centerY = (canvasRef.current.height / engine.camera.zoom - engine.worldHeight) / 2;

    const wx = (e.clientX - rect.left) / engine.camera.zoom + engine.camera.x - centerX;
    const wy = (e.clientY - rect.top) / engine.camera.zoom + engine.camera.y - centerY;
    return { wx, wy };
  };

  const getEntityAt = (wx: number, wy: number) => {
    if (!engine.activeWorld) return null;
    const entities = Array.from(engine.activeWorld.entities.values());
    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i];
      if (ent.name === "Input") continue;
      const x = typeof ent.fields.x === "number" ? ent.fields.x : 0;
      const y = typeof ent.fields.y === "number" ? ent.fields.y : 0;
      const w = typeof ent.fields.width === "number" ? ent.fields.width : 32;
      const h = typeof ent.fields.height === "number" ? ent.fields.height : 32;

      if (wx >= x && wx <= x + w && wy >= y && wy <= y + h) {
        return ent;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    const { wx, wy } = getWorldCoordinates(e);

    if (activeTool === "spawn") {
      const name = `Obj_${Math.floor(Math.random() * 900 + 100)}`;
      if (!engine.activeWorld) return;
      const snapX = snapToGrid ? Math.round(wx / 16) * 16 : Math.round(wx);
      const snapY = snapToGrid ? Math.round(wy / 16) * 16 : Math.round(wy);

      const newEnt = {
        name,
        fields: {
          x: Math.max(0, Math.min(engine.worldWidth - 32, snapX)),
          y: Math.max(0, Math.min(engine.worldHeight - 32, snapY)),
          width: 32,
          height: 32,
          color: "#00F2FE",
          vx: 0,
          vy: 0,
          hp: 100,
        },
        isAgent: false,
        isPersistent: false,
        capabilities: [],
      };
      engine.activeWorld.entities.set(name, newEnt);
      onSelectEntity(name);
      engine.selectedEntityName = name;
      if (onUpdateEntityInCode) onUpdateEntityInCode(name, newEnt);
      engine.render();
      return;
    }

    if (e.button === 1 || e.button === 2 || e.shiftKey || activeTool === "pan") {
      e.preventDefault();
      isPanningRef.current = true;
      return;
    }

    if (activeTool === "select") {
      const hit = getEntityAt(wx, wy);
      if (hit) {
        onSelectEntity(hit.name);
        engine.selectedEntityName = hit.name;
        isDraggingEntityRef.current = true;
        dragEntityNameRef.current = hit.name;
        dragOffsetRef.current = {
          x: wx - (typeof hit.fields.x === "number" ? hit.fields.x : 0),
          y: wy - (typeof hit.fields.y === "number" ? hit.fields.y : 0),
        };
      } else {
        onSelectEntity(null);
        engine.selectedEntityName = null;
      }
      engine.render();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { wx, wy } = getWorldCoordinates(e);

    const hit = getEntityAt(wx, wy);
    setHoveredEntityName(hit ? hit.name : null);

    if (isPanningRef.current) {
      const dx = (e.clientX - lastMousePos.current.x) / engine.camera.zoom;
      const dy = (e.clientY - lastMousePos.current.y) / engine.camera.zoom;
      engine.camera.x -= dx;
      engine.camera.y -= dy;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      engine.render();
      return;
    }

    if (isDraggingEntityRef.current && dragEntityNameRef.current && engine.activeWorld) {
      const ent = engine.activeWorld.entities.get(dragEntityNameRef.current);
      if (ent) {
        let rawX = wx - dragOffsetRef.current.x;
        let rawY = wy - dragOffsetRef.current.y;

        if (snapToGrid) {
          rawX = Math.round(rawX / 16) * 16;
          rawY = Math.round(rawY / 16) * 16;
        }

        const w = typeof ent.fields.width === "number" ? ent.fields.width : 32;
        const h = typeof ent.fields.height === "number" ? ent.fields.height : 32;

        ent.fields.x = Math.max(0, Math.min(engine.worldWidth - w, Math.round(rawX)));
        ent.fields.y = Math.max(0, Math.min(engine.worldHeight - h, Math.round(rawY)));

        engine.render();
      }
    }

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    if (isDraggingEntityRef.current && dragEntityNameRef.current && engine.activeWorld) {
      const ent = engine.activeWorld.entities.get(dragEntityNameRef.current);
      if (ent && onUpdateEntityInCode) {
        onUpdateEntityInCode(dragEntityNameRef.current, ent);
      }
    }

    isPanningRef.current = false;
    isDraggingEntityRef.current = false;
    dragEntityNameRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.4, Math.min(3.0, engine.camera.zoom * zoomFactor));
    engine.camera.zoom = newZoom;
    updateZoomState();
    engine.render();
  };

  const handleVirtualKeyDown = (keyName: string) => {
    if (!isRunning && onTogglePlay) {
      onTogglePlay();
    }
    engine.keysDown[keyName] = true;
    engine.keysDown[keyName.replace("Key", "").toLowerCase()] = true;
    engine.keysDown[keyName.replace("Key", "").toUpperCase()] = true;
  };

  const handleVirtualKeyUp = (keyName: string) => {
    engine.keysDown[keyName] = false;
    engine.keysDown[keyName.replace("Key", "").toLowerCase()] = false;
    engine.keysDown[keyName.replace("Key", "").toUpperCase()] = false;
  };

  const getCursorStyle = () => {
    if (isPanningRef.current) return "cursor-grabbing";
    if (activeTool === "pan") return "cursor-grab";
    if (activeTool === "spawn") return "cursor-cell";
    if (activeTool === "crosshair") return "cursor-crosshair";
    if (hoveredEntityName) return "cursor-move";
    return "cursor-default";
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-slate-950 flex items-center justify-center select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 2D Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`w-full h-full block ${getCursorStyle()}`}
      />

      {/* Tool Palette Toolbar (Top Left) */}
      <div className="absolute top-3 left-3 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-800 shadow-2xl z-10">
        <button
          onClick={() => setActiveTool("select")}
          className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
            activeTool === "select"
              ? "bg-cyan-500 text-slate-950 font-bold shadow-lg"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
          title="Select & Drag Entity (Move Tool)"
        >
          <MousePointer className="w-4 h-4" />
          <span className="hidden sm:inline">Select</span>
        </button>

        <button
          onClick={() => setActiveTool("pan")}
          className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
            activeTool === "pan"
              ? "bg-cyan-500 text-slate-950 font-bold shadow-lg"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
          title="Hand Pan Viewport (Drag Canvas)"
        >
          <Hand className="w-4 h-4" />
          <span className="hidden sm:inline">Hand Pan</span>
        </button>

        <button
          onClick={() => setActiveTool("crosshair")}
          className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
            activeTool === "crosshair"
              ? "bg-cyan-500 text-slate-950 font-bold shadow-lg"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
          title="Inspect Precision Crosshair"
        >
          <Crosshair className="w-4 h-4" />
          <span className="hidden sm:inline">Inspect</span>
        </button>

        <button
          onClick={() => setActiveTool("spawn")}
          className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
            activeTool === "spawn"
              ? "bg-cyan-500 text-slate-950 font-bold shadow-lg"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
          title="Click Canvas to Quick-Spawn Entity"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Spawn</span>
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        <button
          onClick={() => setSnapToGrid(!snapToGrid)}
          className={`px-2 py-1 rounded-lg text-[10px] font-mono transition border ${
            snapToGrid
              ? "bg-slate-800 text-cyan-400 border-cyan-500/40 font-bold"
              : "text-slate-500 border-transparent hover:text-slate-300"
          }`}
          title="16px Grid Snapping for Entity Movement"
        >
          Grid Snap
        </button>
      </div>

      {/* Off-screen Player Alert */}
      {isOffScreen && (
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-amber-950/90 text-amber-200 border border-amber-500/50 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-2xl z-10 animate-bounce">
          <Navigation className="w-4 h-4 text-amber-400 animate-spin" />
          <span className="text-xs font-bold font-mono">
            {offScreenTargetName} is off-screen!
          </span>
          <button
            onClick={handleFocusPlayer}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition"
          >
            <Target className="w-3 h-3" />
            <span>Focus Player</span>
          </button>
        </div>
      )}

      {/* Zoom Controls Overlay (Bottom Left) */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-800 shadow-xl z-10">
        <button
          onClick={handleZoomIn}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
          title="Zoom In (or Mouse Wheel Up)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono text-cyan-400 px-2 font-bold min-w-[45px] text-center">
          {zoomPercent}%
        </span>
        <button
          onClick={handleZoomOut}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
          title="Zoom Out (or Mouse Wheel Down)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetCamera}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
          title="Reset Camera (0,0)"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Selected Entity Indicator Overlay */}
      {selectedEntityName && (
        <div className="absolute bottom-3 left-36 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-500/40 shadow-lg z-10">
          <Crosshair className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-amber-200">
            Selected: {selectedEntityName}
          </span>
          <span className="text-[10px] text-slate-400 font-mono ml-1">
            (Drag mouse or WASD to move)
          </span>
          <button
            onClick={() => {
              engine.selectedEntityName = null;
              onSelectEntity(null);
              engine.render();
            }}
            className="text-xs text-slate-400 hover:text-white ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* On-screen WASD / D-Pad Controller */}
      <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1 bg-slate-900/80 backdrop-blur-md p-2 rounded-2xl border border-slate-800 shadow-xl z-10">
        <div className="text-[10px] text-slate-400 font-mono font-semibold mb-0.5">WASD / ARROWS</div>
        <button
          onMouseDown={() => handleVirtualKeyDown("KeyW")}
          onMouseUp={() => handleVirtualKeyUp("KeyW")}
          onTouchStart={() => handleVirtualKeyDown("KeyW")}
          onTouchEnd={() => handleVirtualKeyUp("KeyW")}
          className="w-8 h-8 bg-slate-800 hover:bg-cyan-600 text-slate-200 active:bg-cyan-500 rounded-lg flex items-center justify-center font-mono font-bold text-xs shadow transition border border-slate-700"
          title="Up (W / Up Arrow)"
        >
          W
        </button>
        <div className="flex items-center gap-1">
          <button
            onMouseDown={() => handleVirtualKeyDown("KeyA")}
            onMouseUp={() => handleVirtualKeyUp("KeyA")}
            onTouchStart={() => handleVirtualKeyDown("KeyA")}
            onTouchEnd={() => handleVirtualKeyUp("KeyA")}
            className="w-8 h-8 bg-slate-800 hover:bg-cyan-600 text-slate-200 active:bg-cyan-500 rounded-lg flex items-center justify-center font-mono font-bold text-xs shadow transition border border-slate-700"
            title="Left (A / Left Arrow)"
          >
            A
          </button>
          <button
            onMouseDown={() => handleVirtualKeyDown("KeyS")}
            onMouseUp={() => handleVirtualKeyUp("KeyS")}
            onTouchStart={() => handleVirtualKeyDown("KeyS")}
            onTouchEnd={() => handleVirtualKeyUp("KeyS")}
            className="w-8 h-8 bg-slate-800 hover:bg-cyan-600 text-slate-200 active:bg-cyan-500 rounded-lg flex items-center justify-center font-mono font-bold text-xs shadow transition border border-slate-700"
            title="Down (S / Down Arrow)"
          >
            S
          </button>
          <button
            onMouseDown={() => handleVirtualKeyDown("KeyD")}
            onMouseUp={() => handleVirtualKeyUp("KeyD")}
            onTouchStart={() => handleVirtualKeyDown("KeyD")}
            onTouchEnd={() => handleVirtualKeyUp("KeyD")}
            className="w-8 h-8 bg-slate-800 hover:bg-cyan-600 text-slate-200 active:bg-cyan-500 rounded-lg flex items-center justify-center font-mono font-bold text-xs shadow transition border border-slate-700"
            title="Right (D / Right Arrow)"
          >
            D
          </button>
        </div>
      </div>
    </div>
  );
};
