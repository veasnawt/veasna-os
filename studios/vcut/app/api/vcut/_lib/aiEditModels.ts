import type Replicate from "replicate";
import { ApiError } from "./paths";
import { extractReplicateMediaBytes } from "./replicateOutput";

/** The models behind AI Edit, in the order they are tried: the first one that returns a picture (or clip) wins, and the
 *  next one only runs when the one before it errored. Field names come from each model's own published input schema. */

export interface EditModel<Input> {
  id: string;
  owner: string;
  name: string;
  build: (input: Input) => Record<string, unknown>;
}

export interface ImageEditInput {
  prompt: string;
  /** URL (or data URL) of the picture to edit. */
  image: string;
}

export const IMAGE_EDIT_MODELS: EditModel<ImageEditInput>[] = [
  {
    id: "gpt-image-2.5-sunburst",
    owner: "openai",
    name: "gpt-image-2.5-sunburst",
    build: ({ prompt, image }) => ({ prompt, input_images: [image], quality: "high", output_format: "png", aspect_ratio: "auto" }),
  },
  {
    id: "flux-kontext-max",
    owner: "black-forest-labs",
    name: "flux-kontext-max",
    build: ({ prompt, image }) => ({ prompt, input_image: image, aspect_ratio: "match_input_image", output_format: "png", safety_tolerance: 2 }),
  },
  {
    id: "nano-banana-pro",
    owner: "google",
    name: "nano-banana-pro",
    build: ({ prompt, image }) => ({ prompt, image_input: [image], aspect_ratio: "match_input_image", resolution: "1K", output_format: "png" }),
  },
  {
    id: "seedream-4.5",
    owner: "bytedance",
    name: "seedream-4.5",
    build: ({ prompt, image }) => ({ prompt, image_input: [image], aspect_ratio: "match_input_image", size: "2K" }),
  },
];

export interface VideoEditInput {
  prompt: string;
  /** URL of the clip to edit (its own sound included). */
  video: string;
  /** URL of the clip's first frame, for the models that only animate a picture. */
  firstFrame: string;
  seconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
}

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

/** A real video-to-video edit keeps the original motion; the picture-to-video models at the end only animate the first
 *  frame from the instruction, so they are the last resort. */
export const VIDEO_EDIT_MODELS: (EditModel<VideoEditInput> & { restyleOnly?: boolean })[] = [
  {
    id: "kling-v3-omni-video",
    owner: "kwaivgi",
    name: "kling-v3-omni-video",
    build: ({ prompt, video, seconds, aspectRatio }) => ({
      prompt,
      reference_video: video,
      video_reference_type: "base",
      keep_original_sound: true,
      mode: "standard",
      duration: clampInt(seconds, 3, 15),
      aspect_ratio: aspectRatio,
      generate_audio: false,
    }),
  },
  {
    id: "p-video-edit",
    owner: "prunaai",
    name: "p-video-edit",
    build: ({ prompt, video }) => ({ video, prompt, save_audio: true, prompt_upsampling: true }),
  },
  {
    id: "wan-2.7-videoedit",
    owner: "wan-video",
    name: "wan-2.7-videoedit",
    build: ({ prompt, video, seconds }) => ({ video, prompt, duration: clampInt(seconds, 2, 10), resolution: "720p", aspect_ratio: "auto", audio_setting: "origin" }),
  },
  {
    id: "gen-4.5",
    owner: "runwayml",
    name: "gen-4.5",
    restyleOnly: true,
    build: ({ prompt, firstFrame, seconds, aspectRatio }) => ({ image: firstFrame, prompt, duration: seconds > 6 ? 10 : 5, aspect_ratio: aspectRatio }),
  },
  {
    id: "veo-3.1",
    owner: "google",
    name: "veo-3.1",
    restyleOnly: true,
    build: ({ prompt, firstFrame, seconds, aspectRatio }) => ({
      image: firstFrame,
      prompt,
      duration: seconds > 7 ? 8 : seconds > 5 ? 6 : 4,
      resolution: "720p",
      aspect_ratio: aspectRatio === "1:1" ? "9:16" : aspectRatio,
      generate_audio: false,
    }),
  },
  {
    id: "seedance-2.0",
    owner: "bytedance",
    name: "seedance-2.0",
    restyleOnly: true,
    build: ({ prompt, firstFrame, seconds }) => ({ image: firstFrame, prompt, duration: clampInt(seconds, 4, 10), resolution: "720p", aspect_ratio: "adaptive", generate_audio: false }),
  },
];

/** Tries each model in turn. Returns the bytes and the model that made them; throws the last error when every model fails. */
export async function runEditChain<Input>(
  replicate: Replicate,
  chain: EditModel<Input>[],
  input: Input,
  opts: { signal?: AbortSignal; onProgress?: (modelIndex: number, status: string) => void; noOutputMessage: string; noOutputCode: string }
): Promise<{ bytes: Buffer; modelId: string; modelIndex: number }> {
  let lastError: unknown = new ApiError(502, opts.noOutputMessage, opts.noOutputCode);
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    if (opts.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    try {
      const found = await replicate.models.get(model.owner, model.name);
      const version = found.latest_version?.id;
      // Some of these are "official" models with no pinned version: run them by name.
      const ref = (version ? `${model.owner}/${model.name}:${version}` : `${model.owner}/${model.name}`) as `${string}/${string}`;
      const output = await replicate.run(ref, { input: model.build(input), signal: opts.signal }, (prediction) => opts.onProgress?.(i, prediction.status));
      const bytes = await extractReplicateMediaBytes(output, opts.noOutputMessage, opts.noOutputCode);
      return { bytes, modelId: model.id, modelIndex: i };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      lastError = err;
      console.error(`[vcut] ai-edit: ${model.id} failed, ${i + 1 < chain.length ? "trying the next model" : "no models left"}:`, err instanceof Error ? err.message.slice(0, 300) : err);
    }
  }
  throw lastError;
}

/** Hands a local file to Replicate as a URL it can fetch, falling back to an inline data URL. */
export async function uploadForModel(replicate: Replicate, bytes: Buffer, mime: string): Promise<string> {
  try {
    const uploaded = await replicate.files.create(new Blob([new Uint8Array(bytes)], { type: mime }));
    return uploaded.urls.get;
  } catch {
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }
}
