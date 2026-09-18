/** Small pure formatters — a deliberate duplicate of `studios/vcut/app/_shared/hostedClient.ts`'s own
 *  copies (which themselves duplicate `packages/vcut/src/api/hostedClient`-adjacent helpers), not an
 *  import: this app's dashboard-level screens stay independent of both the Next.js host and the editor
 *  package for the same "keep the boundary simple" reasoning `hostedClient.ts`'s own top comment gives. */
export function formatUpdatedAt(ms: number): string {
  const diffMinutes = Math.round((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(ms).toLocaleDateString();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
