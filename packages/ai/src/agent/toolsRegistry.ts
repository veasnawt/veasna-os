/**
 * Tool Registry for Rixie Core.
 * Aggregates all studio tools into a unified toolset and dispatch map.
 */
import { MemoryStore } from "../memory/memoryStore";
import { ToolSchema, ToolFn } from "../tools/types";
import { registerBpStudioTools } from "../tools/bpStudioTools";
import { registerMemoryTools } from "../tools/memoryTools";
import { registerArtStudioTools } from "../tools/artStudioTools";
import { registerMusicStudioTools } from "../tools/musicStudioTools";
import { registerGamedevStudioTools } from "../tools/gamedevStudioTools";
import { registerOsSystemTools } from "../tools/osSystemTools";

export function buildToolset(memory: MemoryStore): {
  schemas: ToolSchema[];
  dispatch: Record<string, ToolFn>;
} {
  const modules = [
    registerOsSystemTools(memory),
    registerBpStudioTools(memory),
    registerMemoryTools(memory),
    registerArtStudioTools(memory),
    registerMusicStudioTools(memory),
    registerGamedevStudioTools(memory),
  ];

  const schemas: ToolSchema[] = [];
  const dispatch: Record<string, ToolFn> = {};

  for (const mod of modules) {
    schemas.push(...mod.schemas);
    Object.assign(dispatch, mod.dispatch);
  }

  return { schemas, dispatch };
}
