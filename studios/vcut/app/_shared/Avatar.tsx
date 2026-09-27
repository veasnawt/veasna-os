"use client";

import { useState } from "react";
import { avatarColor, avatarInitial } from "./hostedClient";

/** Uploaded pictures use the same public endpoint across profiles, templates, and comments. */
export function Avatar({
  seed,
  displayName,
  size = 28,
  src,
}: {
  seed: string;
  displayName: string | null | undefined;
  size?: number;
  src?: string | null;
}) {
  const url =
    src === undefined
      ? `/api/vcut/creators/${encodeURIComponent(seed)}/avatar`
      : src;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: avatarColor(seed),
        fontSize: size * 0.45,
      }}
    >
      {url && failedUrl !== url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        avatarInitial(displayName)
      )}
    </span>
  );
}
