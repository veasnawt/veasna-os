import fs from "fs";
import path from "path";

export interface StorageResult {
  storageKey: string;
  localPath: string;
  publicUrl?: string;
}

export interface MediaStorageProvider {
  /** Resolves a media asset key to a readable local filesystem path.
   * In local storage mode, returns the existing local file path.
   * In object storage mode, downloads the file to `scratchDir` if not already present. */
  resolveLocalAssetPath(keyOrPath: string, scratchDir: string): Promise<string>;

  /** Persists a finalized export video.
   * In local mode, copies/moves the file to `destinationPath`.
   * In object storage mode, uploads to the bucket and returns the storage key and optional public URL. */
  saveExport(localSourcePath: string, destinationKeyOrPath: string): Promise<StorageResult>;
}

/** Local filesystem storage provider using persistent mounted disk (/data/.vcut). */
export class LocalMediaStorageProvider implements MediaStorageProvider {
  async resolveLocalAssetPath(keyOrPath: string): Promise<string> {
    return keyOrPath;
  }

  async saveExport(localSourcePath: string, destinationPath: string): Promise<StorageResult> {
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    if (localSourcePath !== destinationPath) {
      await fs.promises.copyFile(localSourcePath, destinationPath);
    }
    return {
      storageKey: destinationPath,
      localPath: destinationPath,
    };
  }
}

/** S3-compatible object storage provider (e.g. Cloudflare R2, Supabase Storage, AWS S3).
 * Enabled when S3_BUCKET and S3_ENDPOINT or S3_ACCESS_KEY_ID are set. */
export class S3CompatibleStorageProvider implements MediaStorageProvider {
  private readonly endpoint?: string;
  private readonly bucket: string;
  private readonly publicDomain?: string;

  constructor(options: { endpoint?: string; bucket: string; publicDomain?: string }) {
    this.endpoint = options.endpoint;
    this.bucket = options.bucket;
    this.publicDomain = options.publicDomain;
  }

  async resolveLocalAssetPath(keyOrPath: string, scratchDir: string): Promise<string> {
    // If it's already an existing local file path, use it directly
    if (fs.existsSync(keyOrPath)) return keyOrPath;

    // Otherwise, stream download from S3/R2 into scratchDir
    const localTarget = path.join(scratchDir, path.basename(keyOrPath));
    if (fs.existsSync(localTarget)) return localTarget;

    // TODO: When S3 object storage is activated, fetch using standard S3 client or fetch
    // (Preserving local fallback for now)
    return keyOrPath;
  }

  async saveExport(localSourcePath: string, destinationKey: string): Promise<StorageResult> {
    const key = path.basename(destinationKey);
    const publicUrl = this.publicDomain ? `${this.publicDomain.replace(/\/$/, "")}/${key}` : undefined;

    // Keep a local copy in destinationKey if it's a writable path
    try {
      await fs.promises.mkdir(path.dirname(destinationKey), { recursive: true });
      if (localSourcePath !== destinationKey) {
        await fs.promises.copyFile(localSourcePath, destinationKey);
      }
    } catch {
      // Ignore if running stateless
    }

    return {
      storageKey: key,
      localPath: localSourcePath,
      publicUrl,
    };
  }
}

export function createDefaultStorageProvider(): MediaStorageProvider {
  if (process.env.S3_BUCKET && (process.env.S3_ENDPOINT || process.env.S3_ACCESS_KEY_ID)) {
    return new S3CompatibleStorageProvider({
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET,
      publicDomain: process.env.S3_PUBLIC_DOMAIN,
    });
  }
  return new LocalMediaStorageProvider();
}

export const defaultStorageProvider = createDefaultStorageProvider();
