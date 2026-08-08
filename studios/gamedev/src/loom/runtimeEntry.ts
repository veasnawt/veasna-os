// Entry point for the standalone player bundle (see vite.runtime.config.ts).
// Bundled as a dependency-free IIFE exposing `window.LoomRuntime` -- this is what
// Export > "Standalone HTML Web App" embeds so exported games run the exact same
// engine as the Studio, not a hand-duplicated copy of it.
export { parse } from "./parser";
export { Interpreter, World, EntityRef, truthy } from "./interpreter";
export { LoomGameEngine } from "./gameEngine";
export type { WorldEntity, EventLogEntry } from "./interpreter";
export type { TileMapData, Camera2D } from "./gameEngine";
