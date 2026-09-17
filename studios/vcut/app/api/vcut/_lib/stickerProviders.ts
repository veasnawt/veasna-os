import crypto from "crypto";
import type { StickerProvider, StickerType } from "@veasnawt/vcut/src/project/stickers";
import { ApiError } from "./paths";

/** One search result, the same shape for both providers — what `StickersPanel.tsx` shows and sends back
 *  to import. */
export interface StickerResult {
  id: string;
  provider: StickerProvider;
  type: StickerType;
  title: string;
  /** A small animated rendition for the grid. */
  previewUrl: string;
  width: number;
  height: number;
  /** The GIF rendition the import converts (see `importAnimatedImageBytes`). */
  downloadUrl: string;
}

export const STICKER_RESULTS_PER_PAGE = 24;

/** Where each provider serves its files from — the import only downloads from these, never an
 *  arbitrary caller-supplied host (same SSRF guard as `stock/route.ts`). */
const DOWNLOAD_HOSTS: Record<StickerProvider, RegExp> = {
  klipy: /(^|\.)klipy\.com$/,
  giphy: /(^|\.)giphy\.com$/,
};

export function isAllowedStickerDownload(provider: StickerProvider, url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && DOWNLOAD_HOSTS[provider].test(parsed.hostname);
  } catch {
    return false;
  }
}

/** KLIPY wants a stable per-user id for its own personalization; a hash, so no real user id leaves. */
export function klipyCustomerId(userId: string | null): string {
  return crypto.createHash("sha256").update(`vcut:${userId ?? "local"}`).digest("hex").slice(0, 32);
}

interface Rendition {
  url?: string;
  width?: number | string;
  height?: number | string;
  size?: number | string;
}

const toNumber = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

async function fetchJson(url: URL, label: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429) throw new ApiError(429, `${label} is busy right now — try again in a moment`, "stickers-rate-limited");
  if (!res.ok) {
    console.error(`[vcut] stickers: ${label} search failed`, res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new ApiError(502, `${label} search is temporarily unavailable`, "stickers-search-failed");
  }
  return res.json();
}

/** KLIPY (api.klipy.com): the app key is part of the path; trending when there's no query. Items of
 *  `type: "ad"` are KLIPY's own optional ad slots — VCut doesn't show ads, so they're skipped. Renditions
 *  live under `file` (hd/md/sm/xs, each with gif/webp/…). */
async function searchKlipy(key: string, type: StickerType, query: string, page: number, customerId: string) {
  const url = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/${type}/${query ? "search" : "trending"}`);
  if (query) url.searchParams.set("q", query.slice(0, 100));
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(STICKER_RESULTS_PER_PAGE));
  url.searchParams.set("customer_id", customerId);
  const json = (await fetchJson(url, "KLIPY")) as { data?: { data?: unknown[]; has_next?: boolean } };

  const results: StickerResult[] = [];
  for (const raw of json.data?.data ?? []) {
    const item = raw as { id?: string | number; slug?: string; title?: string; type?: string; file?: Record<string, Record<string, Rendition>>; files?: Record<string, Record<string, Rendition>> };
    if (item.type === "ad") continue;
    const file = item.file ?? item.files;
    if (!file || item.id == null) continue;
    // The largest GIF, not simply `hd`'s: live GIF results have come back with `hd` SMALLER than `md`
    // (240×100 vs 480×200).
    const download = [file.hd?.gif, file.md?.gif, file.sm?.gif]
      .filter((r): r is Rendition => Boolean(r?.url))
      .reduce<Rendition | undefined>((best, r) => (!best || toNumber(r.width) * toNumber(r.height) > toNumber(best.width) * toNumber(best.height) ? r : best), undefined);
    const preview = file.sm?.webp ?? file.sm?.gif ?? file.md?.webp ?? file.md?.gif ?? download;
    if (!download?.url || !preview?.url) continue;
    results.push({
      id: String(item.id),
      provider: "klipy",
      type,
      title: item.title?.trim() || item.slug || (type === "stickers" ? "Sticker" : "GIF"),
      previewUrl: preview.url,
      width: toNumber(download.width) || toNumber(preview.width) || 1,
      height: toNumber(download.height) || toNumber(preview.height) || 1,
      downloadUrl: download.url,
    });
  }
  return { results, hasMore: Boolean(json.data?.has_next) };
}

/** GIPHY's search offset can't pass this (their documented limit). */
const GIPHY_MAX_OFFSET = 4999;
/** Past this, a GIPHY original is swapped for its "downsized" rendition to keep imports quick. */
const GIPHY_MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;

/** GIPHY (api.giphy.com): `/v1/stickers|gifs/search|trending`, offset-paged. */
async function searchGiphy(key: string, type: StickerType, query: string, page: number) {
  const url = new URL(`https://api.giphy.com/v1/${type}/${query ? "search" : "trending"}`);
  url.searchParams.set("api_key", key);
  if (query) url.searchParams.set("q", query.slice(0, 50));
  const offset = Math.min((page - 1) * STICKER_RESULTS_PER_PAGE, GIPHY_MAX_OFFSET);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(STICKER_RESULTS_PER_PAGE));
  url.searchParams.set("rating", "pg-13");
  const json = (await fetchJson(url, "GIPHY")) as {
    data?: { id?: string; title?: string; images?: Record<string, Rendition & { webp?: string }> }[];
    pagination?: { total_count?: number; count?: number; offset?: number };
  };

  const results: StickerResult[] = [];
  for (const item of json.data ?? []) {
    const images = item.images;
    if (!item.id || !images) continue;
    const original = images.original;
    const download = original?.url && toNumber(original.size) <= GIPHY_MAX_ORIGINAL_BYTES ? original : (images.downsized_large ?? images.downsized ?? original);
    const preview = images.fixed_width;
    if (!download?.url || !preview) continue;
    results.push({
      id: item.id,
      provider: "giphy",
      type,
      title: item.title?.trim() || (type === "stickers" ? "Sticker" : "GIF"),
      previewUrl: preview.webp || preview.url || download.url,
      width: toNumber(download.width) || 1,
      height: toNumber(download.height) || 1,
      downloadUrl: download.url,
    });
  }
  const p = json.pagination;
  const hasMore = Boolean(p && toNumber(p.offset) + toNumber(p.count) < toNumber(p.total_count) && offset + STICKER_RESULTS_PER_PAGE <= GIPHY_MAX_OFFSET);
  return { results, hasMore };
}

export function searchStickerProvider(params: {
  provider: StickerProvider;
  key: string;
  type: StickerType;
  query: string;
  page: number;
  customerId: string;
}): Promise<{ results: StickerResult[]; hasMore: boolean }> {
  return params.provider === "klipy"
    ? searchKlipy(params.key, params.type, params.query, params.page, params.customerId)
    : searchGiphy(params.key, params.type, params.query, params.page);
}
