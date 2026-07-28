import { MemoryStore } from "../memory/memoryStore";
import { ToolModule } from "./types";

export function registerGamedevStudioTools(memory: MemoryStore): ToolModule {
  return {
    schemas: [
      {
        name: "gamedev_design_mechanic",
        description: "Design a game mechanic, control scheme, or interaction rule for Game Dev Studio.",
        input_schema: {
          type: "object",
          properties: {
            mechanicName: { type: "string", description: "Name of mechanic (e.g. Wall Jump, Inventory Crafting)" },
            genre: { type: "string", description: "Game genre (e.g. 2D Platformer, RPG, Puzzle)" },
            description: { type: "string", description: "Detailed mechanics rule" },
          },
          required: ["mechanicName", "genre", "description"],
        },
      },
    ],
    dispatch: {
      gamedev_design_mechanic: async (input: unknown) => {
        const { mechanicName, genre, description } = input as {
          mechanicName: string;
          genre: string;
          description: string;
        };

        const memoryId = memory.add("gamedev", "mechanic_design", `${mechanicName}: ${description}`, {
          genre,
        });

        return {
          status: "success",
          mechanicName,
          genre,
          description,
          memoryId,
        };
      },
    },
  };
}
