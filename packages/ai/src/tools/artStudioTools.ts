import { MemoryStore } from "../memory/memoryStore";
import { ToolModule } from "./types";

export function registerArtStudioTools(memory: MemoryStore): ToolModule {
  return {
    schemas: [
      {
        name: "art_create_palette",
        description: "Create and store a color palette and visual theme for a digital art or UI project.",
        input_schema: {
          type: "object",
          properties: {
            themeName: { type: "string", description: "Name of theme or project (e.g. Neo-Khmer, Cyberpunk)" },
            colors: {
              type: "array",
              items: { type: "string" },
              description: "Array of hex or HSL color strings",
            },
            mood: { type: "string", description: "Visual mood (e.g. warm, vibrant, minimalist)" },
          },
          required: ["themeName", "colors"],
        },
      },
      {
        name: "art_generate_asset_prompt",
        description: "Draft a high-precision prompt for visual asset or thumbnail generation.",
        input_schema: {
          type: "object",
          properties: {
            subject: { type: "string", description: "Subject of the art piece" },
            artStyle: { type: "string", description: "Art style (e.g. 3D render, digital painting, pixel art)" },
            aspectRatio: { type: "string", description: "Aspect ratio (e.g. 1:1, 16:9, 9:16)" },
          },
          required: ["subject", "artStyle"],
        },
      },
    ],
    dispatch: {
      art_create_palette: async (input: unknown) => {
        const { themeName, colors, mood } = input as {
          themeName: string;
          colors: string[];
          mood?: string;
        };
        const memoryId = memory.add("art", "color_palette", `Theme: ${themeName} (${mood || "N/A"})`, {
          colors,
          mood,
        });
        return {
          status: "success",
          themeName,
          colors,
          memoryId,
          message: `Saved art palette '${themeName}' to Art Studio memory.`,
        };
      },
      art_generate_asset_prompt: async (input: unknown) => {
        const { subject, artStyle, aspectRatio = "16:9" } = input as {
          subject: string;
          artStyle: string;
          aspectRatio?: string;
        };
        const prompt = `${subject}, in ${artStyle} style, high resolution, detailed lighting --ar ${aspectRatio}`;
        return {
          status: "success",
          prompt,
          subject,
          artStyle,
          aspectRatio,
        };
      },
    },
  };
}
