import type {
  RecentItem, RecentItemInput, RecentRepository,
} from '../../application/ports/recentRepository';

export type { RecentItem, RecentItemInput } from '../../application/ports/recentRepository';

interface PersistedRecentItems {
  version: 2;
  items: RecentItem[];
}

const STORAGE_KEY = 'recent-documents';
const SCHEMA_VERSION = 2;
const MAX_RECENT = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeItem(value: unknown): RecentItem | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.openedAt !== 'number') return undefined;
  const base = { id: value.id, title: value.title, openedAt: value.openedAt };
  const scrollPosition = typeof value.scrollPosition === 'number' && Number.isFinite(value.scrollPosition) && value.scrollPosition >= 0
    ? value.scrollPosition
    : undefined;
  const headingId = typeof value.headingId === 'string' ? value.headingId : undefined;
  if (value.kind === 'remote' && typeof value.url === 'string') return { ...base, kind: 'remote', url: value.url, scrollPosition, headingId };
  if (value.kind === 'workspace-file' && typeof value.workspaceId === 'string' && typeof value.filePath === 'string') {
    return { ...base, kind: 'workspace-file', workspaceId: value.workspaceId, filePath: value.filePath, scrollPosition, headingId };
  }
  if (value.kind === 'local-file' && typeof value.fileId === 'string') return { ...base, kind: 'local-file', fileId: value.fileId, scrollPosition, headingId };
  return undefined;
}

function normalizeItems(value: unknown): RecentItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeItem).filter((item): item is RecentItem => Boolean(item)).slice(0, MAX_RECENT);
}

export async function loadRecentItems(): Promise<RecentItem[]> {
  if (typeof browser === 'undefined' || !browser.storage) return [];
  let raw: unknown;
  try {
    raw = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  } catch {
    return [];
  }
  if (raw === undefined) return [];
  const current = isRecord(raw) && raw.version === SCHEMA_VERSION ? normalizeItems(raw.items) : undefined;
  if (current) return current;

  const migrated = normalizeItems(raw).filter((item) => item.kind === 'remote');
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: { version: SCHEMA_VERSION, items: migrated } satisfies PersistedRecentItems });
  } catch {
    // Recent items are an optional convenience and must never block the reader.
  }
  return migrated;
}

export async function rememberRecentItem(item: RecentItemInput): Promise<RecentItem[]> {
  const current = await loadRecentItems();
  const previous = current.find((entry) => entry.id === item.id);
  const next = [{ ...previous, ...item, openedAt: Date.now() } as RecentItem, ...current.filter((entry) => entry.id !== item.id)].slice(0, MAX_RECENT);
  if (typeof browser !== 'undefined' && browser.storage) {
    await browser.storage.local.set({ [STORAGE_KEY]: { version: SCHEMA_VERSION, items: next } satisfies PersistedRecentItems });
  }
  return next;
}

export async function updateRecentPosition(id: string, scrollPosition: number, headingId?: string): Promise<RecentItem[]> {
  const current = await loadRecentItems();
  const next = current.map((item) => item.id === id ? { ...item, scrollPosition, headingId } : item);
  if (typeof browser !== 'undefined' && browser.storage) {
    await browser.storage.local.set({ [STORAGE_KEY]: { version: SCHEMA_VERSION, items: next } satisfies PersistedRecentItems });
  }
  return next;
}

export class BrowserRecentRepository implements RecentRepository {
  list(): Promise<RecentItem[]> {
    return loadRecentItems();
  }

  put(item: RecentItemInput): Promise<RecentItem[]> {
    return rememberRecentItem(item);
  }

  updatePosition(id: string, scrollPosition: number, headingId?: string): Promise<RecentItem[]> {
    return updateRecentPosition(id, scrollPosition, headingId);
  }
}
