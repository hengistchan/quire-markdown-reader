export interface RecentItem {
  id: string;
  title: string;
  kind: 'remote' | 'workspace';
  url?: string;
  openedAt: number;
}

const STORAGE_KEY = 'recent-documents';
const MAX_RECENT = 6;

export async function loadRecentItems(): Promise<RecentItem[]> {
  if (typeof browser === 'undefined' || !browser.storage) return [];
  const result = await browser.storage.local.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] as RecentItem[] : [];
}

export async function rememberRecentItem(item: Omit<RecentItem, 'openedAt'>): Promise<RecentItem[]> {
  const current = await loadRecentItems();
  const next = [{ ...item, openedAt: Date.now() }, ...current.filter((entry) => entry.id !== item.id)].slice(0, MAX_RECENT);
  if (typeof browser !== 'undefined' && browser.storage) await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
