export interface Bookmark {
  id: string;
  name: string;
  url: string;
}

const STORAGE_KEY = "veasna-os:browser-bookmarks";

export function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBookmarks(list: Bookmark[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addBookmark(name: string, url: string): Bookmark[] {
  const existing = loadBookmarks();
  if (existing.some((b) => b.url === url)) return existing;
  const bookmark: Bookmark = {
    id: `bm:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || url,
    url,
  };
  const next = [...existing, bookmark];
  saveBookmarks(next);
  return next;
}

export function removeBookmark(id: string): Bookmark[] {
  const next = loadBookmarks().filter((b) => b.id !== id);
  saveBookmarks(next);
  return next;
}

export function isBookmarked(url: string, list: Bookmark[]): boolean {
  return list.some((b) => b.url === url);
}
