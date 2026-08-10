import type {
  RecentResource, RecentResourceInput, RecentResourceRepository,
} from '../../application/ports/recentResourceRepository';

export type {
  RecentResource, RecentResourceInput,
} from '../../application/ports/recentResourceRepository';

interface PersistedRecentResources {
  version: 1;
  items: RecentResource[];
}

const STORAGE_KEY = 'recent-resources';
const SCHEMA_VERSION = 1;
export const MAX_RECENT_RESOURCES = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeResource(value: unknown): RecentResource | undefined {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.title !== 'string'
    || typeof value.openedAt !== 'number'
    || !Number.isFinite(value.openedAt)) return undefined;

  const base = { id: value.id, title: value.title, openedAt: value.openedAt };
  if (value.kind === 'workspace' && typeof value.workspaceId === 'string') {
    return {
      ...base,
      kind: 'workspace',
      workspaceId: value.workspaceId,
      ...(typeof value.lastFilePath === 'string' ? { lastFilePath: value.lastFilePath } : {}),
    };
  }
  if (value.kind === 'local-file' && typeof value.fileId === 'string') {
    return { ...base, kind: 'local-file', fileId: value.fileId };
  }
  if (value.kind === 'remote' && typeof value.url === 'string') {
    return { ...base, kind: 'remote', url: value.url };
  }
  return undefined;
}

function normalizeResources(value: unknown): RecentResource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map(normalizeResource)
    .filter((resource): resource is RecentResource => Boolean(resource))
    .sort((left, right) => right.openedAt - left.openedAt)
    .filter((resource) => {
      if (seen.has(resource.id)) return false;
      seen.add(resource.id);
      return true;
    })
    .slice(0, MAX_RECENT_RESOURCES);
}

async function persist(items: RecentResource[]): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage) return;
  try {
    await browser.storage.local.set({
      [STORAGE_KEY]: { version: SCHEMA_VERSION, items } satisfies PersistedRecentResources,
    });
  } catch {
    // Recent Resources are optional and must not block the reader.
  }
}

export async function loadRecentResources(): Promise<RecentResource[]> {
  if (typeof browser === 'undefined' || !browser.storage) return [];
  try {
    const raw: unknown = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    if (!isRecord(raw) || raw.version !== SCHEMA_VERSION) return [];
    return normalizeResources(raw.items);
  } catch {
    return [];
  }
}

export async function rememberRecentResource(resource: RecentResourceInput): Promise<RecentResource[]> {
  const current = await loadRecentResources();
  const previous = current.find((entry) => entry.id === resource.id);
  const next = [
    { ...previous, ...resource, openedAt: Date.now() } as RecentResource,
    ...current.filter((entry) => entry.id !== resource.id),
  ].slice(0, MAX_RECENT_RESOURCES);
  await persist(next);
  return next;
}

export async function removeRecentResource(id: string): Promise<RecentResource[]> {
  const current = await loadRecentResources();
  const next = current.filter((resource) => resource.id !== id);
  if (next.length !== current.length) await persist(next);
  return next;
}

export async function updateRecentWorkspaceDocument(
  workspaceId: string,
  filePath: string,
): Promise<RecentResource[]> {
  const current = await loadRecentResources();
  let changed = false;
  const next = current.map((resource) => {
    if (resource.kind !== 'workspace'
      || resource.workspaceId !== workspaceId
      || resource.lastFilePath === filePath) return resource;
    changed = true;
    return { ...resource, lastFilePath: filePath };
  });
  if (changed) await persist(next);
  return next;
}

export class BrowserRecentResourceRepository implements RecentResourceRepository {
  list(): Promise<RecentResource[]> {
    return loadRecentResources();
  }

  put(resource: RecentResourceInput): Promise<RecentResource[]> {
    return rememberRecentResource(resource);
  }

  remove(id: string): Promise<RecentResource[]> {
    return removeRecentResource(id);
  }

  updateWorkspaceDocument(workspaceId: string, filePath: string): Promise<RecentResource[]> {
    return updateRecentWorkspaceDocument(workspaceId, filePath);
  }
}
