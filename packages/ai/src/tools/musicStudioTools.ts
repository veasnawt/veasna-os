import { MemoryStore } from "../memory/memoryStore";
import { ToolModule } from "./types";

export function registerMusicStudioTools(memory: MemoryStore): ToolModule {
  return {
    schemas: [
      {
        name: "music_plan_track",
        description: "Plan a musical track structure, tempo, key signature, and instrumentation for a video or game.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Track title" },
            genre: { type: "string", description: "Genre (e.g. Ambient, Lo-Fi, Cinematic Orchestral)" },
            bpm: { type: "number", description: "Beats per minute (e.g. 90, 120)" },
            keySignature: { type: "string", description: "Key (e.g. C minor, A major)" },
            mood: { type: "string", description: "Emotional tone" },
          },
          required: ["title", "genre", "bpm"],
        },
      },
      {
        name: "music_write_lyrics",
        description: "Draft verses and chorus lyrics for a song or jingle.",
        input_schema: {
          type: "object",
          properties: {
            topic: { type: "string", description: "Lyric theme or story" },
            style: { type: "string", description: "Lyric style (e.g. poetic, pop, rhythmic)" },
          },
          required: ["topic"],
        },
      },
    ],
    dispatch: {
      music_plan_track: async (input: unknown) => {
        const { title, genre, bpm, keySignature = "C Major", mood = "energetic" } = input as {
          title: string;
          genre: string;
          bpm: number;
          keySignature?: string;
          mood?: string;
        };

        const memoryId = memory.add(
          "music",
          "track_plan",
          `Track: ${title} (${genre}, ${bpm} BPM, ${keySignature})`,
          { title, genre, bpm, keySignature, mood }
        );

        return {
          status: "success",
          title,
          genre,
          bpm,
          keySignature,
          mood,
          structure: ["Intro", "Verse 1", "Chorus", "Verse 2", "Chorus", "Outro"],
          memoryId,
        };
      },
      music_write_lyrics: async (input: unknown) => {
        const { topic, style = "pop" } = input as { topic: string; style?: string };
        return {
          status: "success",
          topic,
          style,
          draft: `[Verse 1]\nWalking down the neon street, feeling the rhythm in the beat...\n\n[Chorus]\nThis is our world, under the sky so high...`,
        };
      },
    },
  };
}
