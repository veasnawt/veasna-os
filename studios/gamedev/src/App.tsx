import { useState, useEffect, useRef } from "react";
import { LandingPage } from "./components/LandingPage";
import { Header } from "./components/Header";
import { Viewport2D } from "./components/Viewport2D";
import { HierarchyPanel } from "./components/HierarchyPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { CodeEditorPanel } from "./components/CodeEditorPanel";
import { EventLogPanel } from "./components/EventLogPanel";
import { CanvasSizeModal } from "./components/CanvasSizeModal";
import { TilemapEditorModal } from "./components/TilemapEditorModal";
import { SpriteStudioModal } from "./components/SpriteStudioModal";
import { BackgroundModal } from "./components/BackgroundModal";
import { ExportModal } from "./components/ExportModal";
import { DocumentationModal } from "./components/DocumentationModal";
import { AddEntityModal, type NewEntityConfig } from "./components/AddEntityModal";
import { ToastNotification, type ToastMessage } from "./components/ToastNotification";

import { LoomGameEngine, type TileMapData } from "./loom/gameEngine";
import { GAME_PRESETS, type GamePreset } from "./loom/presets";
import type { EventLogEntry, WorldEntity } from "./loom/interpreter";
import { updateEntityInLoomCode } from "./loom/codeSync";
import { Code2, Terminal, ChevronUp, ChevronDown, GripHorizontal, GripVertical } from "lucide-react";

export default function App() {
  const [pageState, setPageState] = useState<"landing" | "studio">(() => {
    try {
      const saved = localStorage.getItem("loom_engine_autosave");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.pageState === "studio" || parsed.pageState === "landing") {
          return parsed.pageState;
        }
      }
    } catch (e) {}
    return "landing";
  });

  const engineRef = useRef<LoomGameEngine>(new LoomGameEngine(GAME_PRESETS[0].loomCode));
  const engine = engineRef.current;

  const [currentPreset, setCurrentPreset] = useState<GamePreset>(GAME_PRESETS[0]);
  const [projectName, setProjectName] = useState<string>(GAME_PRESETS[0].name);
  const [loomCode, setLoomCode] = useState<string>(GAME_PRESETS[0].loomCode);

  const [isRunning, setIsRunning] = useState<boolean>(false); // PAUSED on mount!
  const [timeScale, setTimeScale] = useState<number>(1);
  const [debugMode, setDebugMode] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const [worldWidth, setWorldWidth] = useState<number>(800);
  const [worldHeight, setWorldHeight] = useState<number>(600);

  const [selectedEntityName, setSelectedEntityName] = useState<string | null>("Player");
  const [activeBottomTab, setActiveBottomTab] = useState<"code" | "log">("code");
  const [isBottomCollapsed, setIsBottomCollapsed] = useState<boolean>(false);

  // Panel Dimensions
  const [bottomHeight, setBottomHeight] = useState<number>(300);
  const [leftWidth, setLeftWidth] = useState<number>(250);
  const [rightWidth, setRightWidth] = useState<number>(280);

  const [eventLogs, setEventLogs] = useState<EventLogEntry[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modals state
  const [showCanvasSize, setShowCanvasSize] = useState<boolean>(false);
  const [showTilemap, setShowTilemap] = useState<boolean>(false);
  const [showSpriteStudio, setShowSpriteStudio] = useState<boolean>(false);
  const [showBackground, setShowBackground] = useState<boolean>(false);
  const [showExport, setShowExport] = useState<boolean>(false);
  const [showDoc, setShowDoc] = useState<boolean>(false);
  const [showAddEntity, setShowAddEntity] = useState<boolean>(false);

  const [, setTick] = useState<number>(0);

  const showToast = (type: ToastMessage["type"], title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { id, type, title, message };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Continuous Auto-Save to LocalStorage on any state change
  useEffect(() => {
    try {
      const saveData = {
        pageState,
        projectName,
        loomCode,
        worldWidth,
        worldHeight,
        tileMap: engine.tileMap,
        presetId: currentPreset.id,
      };
      localStorage.setItem("loom_engine_autosave", JSON.stringify(saveData));
    } catch (e) {
      // Ignore quota errors
    }
  }, [pageState, projectName, loomCode, worldWidth, worldHeight, currentPreset.id]);

  const handleSelectPreset = (preset: GamePreset) => {
    setCurrentPreset(preset);
    setProjectName(preset.name);
    setLoomCode(preset.loomCode);
    if (preset.tileMapGrid) {
      const grid = preset.tileMapGrid.map((r) => [...r]);
      engine.tileMap.grid = grid;
      // Keep cols/rows in sync with the actual grid shape -- rendering and tilemap
      // collision detection both iterate up to tileMap.cols/rows, not grid.length,
      // so a preset with a wider-than-default level would otherwise get silently
      // truncated to whatever cols/rows happened to be left over from before.
      engine.tileMap.rows = grid.length;
      engine.tileMap.cols = grid[0]?.length || engine.tileMap.cols;
    }
    if (preset.worldWidth) {
      setWorldWidth(preset.worldWidth);
      engine.worldWidth = preset.worldWidth;
    }
    if (preset.worldHeight) {
      setWorldHeight(preset.worldHeight);
      engine.worldHeight = preset.worldHeight;
    }
    engine.camera.x = 0;
    engine.camera.y = 0;
    engine.camera.zoom = 1;
    engine.pause();
    setIsRunning(false);
    engine.loadSource(preset.loomCode, undefined, preset.id === "blank_canvas");

    if (preset.id === "empty_starter" || preset.id !== "blank_canvas") {
      engine.ensurePlayerEntity();
      setSelectedEntityName("Player");
      engine.selectedEntityName = "Player";
    } else {
      setSelectedEntityName(null);
      engine.selectedEntityName = null;
    }
    engine.render();
  };

  // Initialize engine on mount: restore autosave if present
  useEffect(() => {
    engine.onStateUpdate = () => {
      setTick((t) => t + 1);
      if (engine.activeWorld) {
        setEventLogs([...engine.activeWorld.eventLog]);
      }
    };
    engine.onLog = (msg) => {
      console.log("[Loom Engine]", msg);
    };

    try {
      const saved = localStorage.getItem("loom_engine_autosave");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.projectName) setProjectName(parsed.projectName);
        if (parsed.loomCode) setLoomCode(parsed.loomCode);
        if (parsed.worldWidth) {
          setWorldWidth(parsed.worldWidth);
          engine.worldWidth = parsed.worldWidth;
        }
        if (parsed.worldHeight) {
          setWorldHeight(parsed.worldHeight);
          engine.worldHeight = parsed.worldHeight;
        }
        if (parsed.tileMap) {
          engine.tileMap = parsed.tileMap;
        }
        if (parsed.presetId) {
          const foundPreset = GAME_PRESETS.find((p) => p.id === parsed.presetId);
          if (foundPreset) setCurrentPreset(foundPreset);
        }
        engine.loadSource(
          parsed.loomCode || GAME_PRESETS[0].loomCode,
          undefined,
          parsed.presetId === "blank_canvas"
        );
        if (parsed.presetId !== "blank_canvas") {
          engine.ensurePlayerEntity();
          setSelectedEntityName("Player");
          engine.selectedEntityName = "Player";
        }
        engine.render();
        return;
      }
    } catch (e) {
      console.error("Failed to restore autosave", e);
    }

    engine.worldWidth = worldWidth;
    engine.worldHeight = worldHeight;
    handleSelectPreset(GAME_PRESETS[0]);
  }, []);

  const handleEnterStudioFromLanding = (preset?: GamePreset) => {
    const targetPreset = preset || GAME_PRESETS[0];
    handleSelectPreset(targetPreset);
    setPageState("studio");
    setTimeout(() => {
      engine.render();
    }, 50);
  };

  const handleBackToLanding = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes in your project. Do you want to proceed without saving?\n\n(Click OK to discard changes, or Cancel to remain in studio)"
      );
      if (!confirmed) return;
    }
    setIsDirty(false);
    setPageState("landing");
  };

  // Save single unified .loomproj file named after projectName
  const handleSaveProject = () => {
    const projectData = {
      projectName,
      loomCode,
      tileMap: engine.tileMap,
      worldWidth,
      worldHeight,
      presetId: currentPreset.id,
      savedAt: new Date().toISOString(),
    };

    const fileName = (projectName || "my_loom_project")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_");

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.loomproj`;
    a.click();
    URL.revokeObjectURL(url);

    setIsDirty(false);
    showToast("success", "Project Saved", `Downloaded ${fileName}.loomproj`);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes in your project. Do you want to proceed without saving?"
      );
      if (!confirmed) {
        e.target.value = "";
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      if (file.name.endsWith(".loomproj") || file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.projectName) setProjectName(parsed.projectName);
          if (parsed.loomCode) setLoomCode(parsed.loomCode);
          if (parsed.worldWidth) {
            setWorldWidth(parsed.worldWidth);
            engine.worldWidth = parsed.worldWidth;
          }
          if (parsed.worldHeight) {
            setWorldHeight(parsed.worldHeight);
            engine.worldHeight = parsed.worldHeight;
          }
          if (parsed.tileMap) {
            engine.tileMap = parsed.tileMap;
          }
          engine.camera.x = 0;
          engine.camera.y = 0;
          engine.camera.zoom = 1;
          engine.loadSource(parsed.loomCode || loomCode, undefined, parsed.presetId === "blank_canvas");
          engine.render();
          setIsDirty(false);
          setPageState("studio");
          showToast("success", "Project Loaded Successfully", file.name);
        } catch (err) {
          showToast("error", "Error Loading Project", "File structure is corrupted or invalid.");
        }
      } else if (file.name.endsWith(".loom")) {
        const cleanName = file.name.replace(".loom", "");
        setProjectName(cleanName);
        setLoomCode(content);
        engine.camera.x = 0;
        engine.camera.y = 0;
        engine.camera.zoom = 1;
        engine.loadSource(content, undefined, false);
        engine.render();
        setIsDirty(false);
        setPageState("studio");
        showToast("success", "Loom Script File Loaded", file.name);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleApplyCanvasSize = (newWidth: number, newHeight: number) => {
    setWorldWidth(newWidth);
    setWorldHeight(newHeight);

    engine.worldWidth = newWidth;
    engine.worldHeight = newHeight;

    const ts = engine.tileMap.tileSize;
    const newCols = Math.ceil(newWidth / ts);
    const newRows = Math.ceil(newHeight / ts);

    engine.tileMap.cols = newCols;
    engine.tileMap.rows = newRows;

    const newGrid: number[][] = [];
    for (let r = 0; r < newRows; r++) {
      const row: number[] = [];
      for (let c = 0; c < newCols; c++) {
        row.push(engine.tileMap.grid[r]?.[c] || 0);
      }
      newGrid.push(row);
    }
    engine.tileMap.grid = newGrid;

    engine.render();
    setIsDirty(true);
    setTick((t) => t + 1);
    showToast("info", "Canvas Size Updated", `${newWidth} × ${newHeight} px`);
  };

  const handleUpdateEntityInCode = (entityName: string, entityObj?: WorldEntity | null) => {
    setLoomCode((prevCode) => updateEntityInLoomCode(prevCode, entityName, entityObj));
    setIsDirty(true);
  };

  // The world background lives on the reserved "Game" meta-entity's `background`
  // field (a data URL), the same entity the HUD already reads `wave`/`timeLeft`
  // from. Creates a Game entity on the fly if the preset doesn't already have one,
  // and cleans it back up if background was its only field.
  const handleApplyBackground = (dataUrl: string | null) => {
    if (!engine.activeWorld) return;
    let gameEnt = engine.activeWorld.entities.get("Game");

    if (!gameEnt) {
      if (!dataUrl) return;
      gameEnt = { name: "Game", fields: {}, isAgent: false, isPersistent: false, capabilities: [] };
      engine.activeWorld.entities.set("Game", gameEnt);
    }

    if (dataUrl) {
      gameEnt.fields.background = dataUrl;
    } else {
      delete gameEnt.fields.background;
    }

    if (Object.keys(gameEnt.fields).length === 0) {
      engine.activeWorld.entities.delete("Game");
      handleUpdateEntityInCode("Game", null);
    } else {
      handleUpdateEntityInCode("Game", gameEnt);
    }

    engine.render();
    showToast(dataUrl ? "success" : "info", dataUrl ? "Background Applied" : "Background Removed");
  };

  // Camera follow-target lives on the reserved "Game" meta-entity's `cameraFollow`
  // field (same pattern as `background` above), so which entity the camera tracks
  // -- and the `cameraFocusX` anchor read by gameEngine.ts -- round-trips through
  // the Loom script and is editable via the Inspector's generic field editor once
  // Game is selected, instead of living only as transient in-session engine state.
  const handleSetCameraFollow = (name: string | null) => {
    if (!engine.activeWorld) return;
    let gameEnt = engine.activeWorld.entities.get("Game");

    if (!gameEnt) {
      if (!name) return;
      gameEnt = { name: "Game", fields: {}, isAgent: false, isPersistent: false, capabilities: [] };
      engine.activeWorld.entities.set("Game", gameEnt);
    }

    if (name) {
      gameEnt.fields.cameraFollow = name;
    } else {
      delete gameEnt.fields.cameraFollow;
    }

    if (Object.keys(gameEnt.fields).length === 0) {
      engine.activeWorld.entities.delete("Game");
      handleUpdateEntityInCode("Game", null);
    } else {
      handleUpdateEntityInCode("Game", gameEnt);
    }

    engine.render();
    setTick((t) => t + 1);
  };

  // Synchronous Direct Drag Handlers
  const handleBottomMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startHeight = bottomHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(100, Math.min(window.innerHeight - 120, startHeight + deltaY));
      setBottomHeight(newHeight);
      setIsBottomCollapsed(false);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleLeftMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = leftWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(160, Math.min(500, startWidth + deltaX));
      setLeftWidth(newWidth);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleRightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = rightWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(180, Math.min(500, startWidth + deltaX));
      setRightWidth(newWidth);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleTogglePlay = () => {
    if (isRunning) {
      engine.pause();
      setIsRunning(false);
    } else {
      engine.start();
      setIsRunning(true);
    }
  };

  const handleStep = () => {
    engine.step(16);
  };

  const handleReset = () => {
    handleSelectPreset(currentPreset);
    showToast("info", "Simulation Reset", "State restored to preset initial configuration.");
  };

  const handleCompile = (codeToCompile: string, silent = false): boolean => {
    setLoomCode(codeToCompile);
    const ok = engine.loadSource(codeToCompile, undefined, currentPreset.id === "blank_canvas");
    engine.render();
    if (!silent) {
      if (ok) {
        showToast("success", "Compilation OK", "Loom code compiled cleanly.");
      } else {
        showToast("error", "Compilation Failed", "Check syntax errors in Loom Script Editor.");
      }
    }
    return ok;
  };

  const handleAddEntity = () => {
    setShowAddEntity(true);
  };

  const handleCreateEntity = (config: NewEntityConfig) => {
    if (!engine.activeWorld) return;

    const newEnt: WorldEntity = {
      name: config.name,
      fields: {
        x: Math.floor(Math.random() * (worldWidth - 160) + 80),
        y: Math.floor(Math.random() * (worldHeight - 160) + 80),
        width: config.width,
        height: config.height,
        color: config.color,
        vx: 0,
        vy: 0,
        hp: 100,
      },
      isAgent: config.isAgent,
      isPersistent: false,
      capabilities: config.capabilities,
    };

    engine.activeWorld.entities.set(config.name, newEnt);
    setSelectedEntityName(config.name);
    engine.selectedEntityName = config.name;
    handleUpdateEntityInCode(config.name, newEnt);
    engine.render();
    setIsDirty(true);
    setTick((t) => t + 1);
    showToast("success", `${config.isAgent ? "Agent" : "Entity"} Added`, config.name);
  };

  if (pageState === "landing") {
    return (
      <>
        <LandingPage
          onEnterStudio={handleEnterStudioFromLanding}
          onLoadProjectFile={handleLoadProject}
          onOpenDoc={() => setShowDoc(true)}
        />
        {showDoc && <DocumentationModal onClose={() => setShowDoc(false)} />}
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none relative">
      {/* Toast Notifications */}
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />

      {/* Top Header Navigation */}
      <Header
        projectName={projectName}
        onRenameProject={(name) => {
          setProjectName(name);
        }}
        currentPresetId={currentPreset.id}
        onSelectPreset={handleSelectPreset}
        isRunning={isRunning}
        onTogglePlay={handleTogglePlay}
        onStep={handleStep}
        onReset={handleReset}
        timeScale={timeScale}
        onChangeTimeScale={(scale) => {
          setTimeScale(scale);
          engine.timeScale = scale;
        }}
        debugMode={debugMode}
        onToggleDebug={() => {
          setDebugMode(!debugMode);
          engine.debugMode = !debugMode;
          engine.render();
        }}
        muted={muted}
        onToggleMute={() => {
          setMuted(!muted);
        }}
        worldWidth={worldWidth}
        worldHeight={worldHeight}
        onOpenCanvasSize={() => setShowCanvasSize(true)}
        onOpenTilemap={() => setShowTilemap(true)}
        onOpenSpriteStudio={() => setShowSpriteStudio(true)}
        onOpenBackground={() => setShowBackground(true)}
        onOpenExport={() => setShowExport(true)}
        onOpenDoc={() => setShowDoc(true)}
        onAddEntity={handleAddEntity}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onBackToLanding={handleBackToLanding}
      />

      {/* Main Workspace (Split View) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Hierarchy Panel */}
        <div style={{ width: `${leftWidth}px` }} className="shrink-0 h-full flex min-w-0">
          <HierarchyPanel
            engine={engine}
            selectedEntityName={selectedEntityName}
            onSelectEntity={setSelectedEntityName}
            onAddEntity={handleAddEntity}
            onSetCameraFollow={handleSetCameraFollow}
          />
        </div>

        {/* Left Vertical Resizer Divider */}
        <div
          onMouseDown={handleLeftMouseDown}
          className="w-2 hover:w-2.5 bg-slate-800 hover:bg-cyan-500 cursor-col-resize shrink-0 transition-colors z-20 flex items-center justify-center group select-none"
          title="Drag to resize Hierarchy panel"
        >
          <GripVertical className="w-3 h-3 text-slate-600 group-hover:text-white" />
        </div>

        {/* Center Viewport & Bottom Resizable Script Editor */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-slate-950 min-h-0">
          {/* Canvas 2D Viewport */}
          <div className="flex-1 relative min-h-0 overflow-hidden">
            <Viewport2D
              engine={engine}
              selectedEntityName={selectedEntityName}
              onSelectEntity={setSelectedEntityName}
              onUpdateEntityInCode={handleUpdateEntityInCode}
              isRunning={isRunning}
              onTogglePlay={handleTogglePlay}
            />
          </div>

          {/* Horizontal Resizer Divider above Bottom Dock */}
          <div
            onMouseDown={handleBottomMouseDown}
            className="h-2.5 hover:h-3.5 bg-slate-800 hover:bg-cyan-500 cursor-row-resize shrink-0 transition-all z-20 flex items-center justify-center group select-none"
            title="Drag up or down to resize Script Editor"
          >
            <div className="w-14 h-1 rounded-full bg-slate-600 group-hover:bg-white transition" />
          </div>

          {/* Bottom Dock Tabs (Code Studio / Occurrence Log) */}
          <div
            style={{ height: isBottomCollapsed ? "36px" : `${bottomHeight}px` }}
            className="shrink-0 flex flex-col bg-slate-950 relative min-h-0 overflow-hidden"
          >
            {/* Tab Bar Header */}
            <div className="h-9 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setActiveBottomTab("code");
                    setIsBottomCollapsed(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
                    activeBottomTab === "code" && !isBottomCollapsed
                      ? "bg-slate-800 text-cyan-400 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Loom Script Editor</span>
                </button>

                <button
                  onClick={() => {
                    setActiveBottomTab("log");
                    setIsBottomCollapsed(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
                    activeBottomTab === "log" && !isBottomCollapsed
                      ? "bg-slate-800 text-cyan-400 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Occurrence Log ({eventLogs.length})</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div
                  onMouseDown={handleBottomMouseDown}
                  className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 hover:text-cyan-300 cursor-row-resize px-2 py-0.5 rounded hover:bg-slate-800 font-mono"
                  title="Drag to resize Script Editor height"
                >
                  <GripHorizontal className="w-3.5 h-3.5" />
                  <span>Drag Resize</span>
                </div>

                <button
                  onClick={() => setIsBottomCollapsed(!isBottomCollapsed)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title={isBottomCollapsed ? "Expand Dock" : "Collapse Dock"}
                >
                  {isBottomCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Tab Content */}
            {!isBottomCollapsed && (
              <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
                {activeBottomTab === "code" ? (
                  <CodeEditorPanel
                    code={loomCode}
                    onChangeCode={setLoomCode}
                    onCompile={handleCompile}
                    onStartResize={handleBottomMouseDown}
                  />
                ) : (
                  <EventLogPanel
                    logs={eventLogs}
                    onClearLogs={() => {
                      if (engine.activeWorld) engine.activeWorld.eventLog = [];
                      setEventLogs([]);
                      showToast("info", "Log Stream Cleared");
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Vertical Resizer Divider */}
        <div
          onMouseDown={handleRightMouseDown}
          className="w-2 hover:w-2.5 bg-slate-800 hover:bg-cyan-500 cursor-col-resize shrink-0 transition-colors z-20 flex items-center justify-center group select-none"
          title="Drag to resize Inspector panel"
        >
          <GripVertical className="w-3 h-3 text-slate-600 group-hover:text-white" />
        </div>

        {/* Right Inspector Panel */}
        <div style={{ width: `${rightWidth}px` }} className="shrink-0 h-full flex min-w-0">
          <InspectorPanel
            engine={engine}
            selectedEntityName={selectedEntityName}
            onSelectEntity={setSelectedEntityName}
            onStateChange={() => {
              setTick((t) => t + 1);
              engine.render();
            }}
            onUpdateEntityInCode={handleUpdateEntityInCode}
            onOpenSpriteStudio={() => setShowSpriteStudio(true)}
            onSetCameraFollow={handleSetCameraFollow}
          />
        </div>
      </div>

      {/* Modals */}
      {showCanvasSize && (
        <CanvasSizeModal
          currentWidth={worldWidth}
          currentHeight={worldHeight}
          onApplySize={handleApplyCanvasSize}
          onClose={() => setShowCanvasSize(false)}
        />
      )}

      {showTilemap && (
        <TilemapEditorModal
          tileMap={engine.tileMap}
          onSaveTileMap={(newMap: TileMapData) => {
            engine.tileMap = newMap;
            engine.render();
            showToast("success", "Tilemap Saved");
          }}
          onClose={() => setShowTilemap(false)}
        />
      )}

      {showSpriteStudio && (
        <SpriteStudioModal
          onClose={() => setShowSpriteStudio(false)}
          onApply={(value: string, kind: "color" | "sprite") => {
            if (!selectedEntityName || !engine.activeWorld) {
              showToast("error", "No Entity Selected", "Select an entity first to give it a sprite.");
              return;
            }
            const ent = engine.activeWorld.entities.get(selectedEntityName);
            if (!ent) return;
            if (kind === "sprite") {
              ent.fields.sprite = value;
              showToast("success", "Sprite Image Applied", selectedEntityName);
            } else {
              delete ent.fields.sprite;
              ent.fields.color = value;
              showToast("success", "Sprite Color Saved", `${selectedEntityName} → ${value}`);
            }
            handleUpdateEntityInCode(selectedEntityName, ent);
            engine.render();
          }}
        />
      )}

      {showBackground && (
        <BackgroundModal
          currentBackground={engine.activeWorld?.entities.get("Game")?.fields.background || null}
          onApply={handleApplyBackground}
          onClose={() => setShowBackground(false)}
        />
      )}

      {showExport && (
        <ExportModal
          loomCode={loomCode}
          projectName={projectName}
          tileMap={engine.tileMap}
          worldWidth={worldWidth}
          worldHeight={worldHeight}
          onClose={() => setShowExport(false)}
        />
      )}

      {showDoc && <DocumentationModal onClose={() => setShowDoc(false)} />}

      {showAddEntity && (
        <AddEntityModal
          existingNames={
            engine.activeWorld ? Array.from(engine.activeWorld.entities.keys()) : []
          }
          onCreateEntity={handleCreateEntity}
          onClose={() => setShowAddEntity(false)}
        />
      )}
    </div>
  );
}
