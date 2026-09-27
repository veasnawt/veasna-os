import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { ffmpegBinary } from "./ffmpeg";
import { ApiError, userMediaPaths } from "./paths";

export function profilePicturePath(userId: string, key: string): string {
  if (!/^[0-9a-f-]{36}\.jpg$/.test(key))
    throw new ApiError(400, "Invalid picture", "invalid-picture");
  return path.join(userMediaPaths(userId).dir, "profile", key);
}

/** Decode and re-encode uploads: public avatars never serve the original user bytes. */
export async function prepareProfilePicture(
  userId: string,
  file: File,
): Promise<string> {
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw new ApiError(400, "Choose a picture under 5 MB", "invalid-picture");
  const bytes = Buffer.from(await file.arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp)
    throw new ApiError(
      400,
      "Choose a JPG, PNG, or WebP picture",
      "invalid-picture",
    );
  const key = `${crypto.randomUUID()}.jpg`;
  const output = profilePicturePath(userId, key);
  const input = `${output}.upload`;
  await fs.mkdir(path.dirname(output), { recursive: true });
  try {
    await fs.writeFile(input, bytes);
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegBinary(),
        [
          "-v",
          "error",
          "-y",
          "-threads",
          "1",
          "-max_pixels",
          "16777216",
          "-i",
          input,
          "-vf",
          "scale=512:512:force_original_aspect_ratio=increase,crop=512:512",
          "-frames:v",
          "1",
          "-threads",
          "1",
          "-q:v",
          "3",
          output,
        ],
        { timeout: 15000, maxBuffer: 1024 * 1024 },
        (err) =>
          err
            ? reject(
                new ApiError(
                  400,
                  "Couldn't read that picture. Try another image.",
                  "invalid-picture",
                ),
              )
            : resolve(),
      );
    });
    return key;
  } catch (err) {
    await fs.rm(output, { force: true }).catch(() => {});
    throw err;
  } finally {
    await fs.rm(input, { force: true }).catch(() => {});
  }
}

export async function removeProfilePicture(
  userId: string,
  key: string,
): Promise<void> {
  await fs.rm(profilePicturePath(userId, key), { force: true });
}
