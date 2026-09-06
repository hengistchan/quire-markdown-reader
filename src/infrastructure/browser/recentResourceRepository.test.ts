import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadRecentResources,
  MAX_RECENT_RESOURCES,
  rememberRecentResource,
  removeRecentResource,
  updateRecentWorkspaceDocument,
} from './recentResourceRepository';

function installStorage(initial: unknown = { version: 1, items: [] }) {
  let stored = initial;
  const set = vi.fn(async (value: Record<string, unknown>) => {
    stored = value['recent-resources'];
  });
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: vi.fn(async () => ({ 'recent-resources': stored })),
        set,
      },
    },
  });
  return { set, value: () => stored };
}

describe('recent resources repository', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('deduplicates, moves to front, timestamps, and caps resources', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T10:00:00Z'));
    installStorage({
      version: 1,
      items: Array.from({ length: MAX_RECENT_RESOURCES }, (_, index) => ({
        id: index === 4 ? 'local-file:same' : `remote:https://example.com/${index}.md`,
        title: `Resource ${index}`,
        kind: index === 4 ? ('local-file' as const) : ('remote' as const),
        ...(index === 4 ? { fileId: 'same' } : { url: `https://example.com/${index}.md` }),
        openedAt: MAX_RECENT_RESOURCES - index,
      })),
    });

    const result = await rememberRecentResource({
      id: 'local-file:same',
      title: 'Updated.md',
      kind: 'local-file',
      fileId: 'same',
    });

    expect(result).toHaveLength(MAX_RECENT_RESOURCES);
    expect(result[0]).toEqual({
      id: 'local-file:same',
      title: 'Updated.md',
      kind: 'local-file',
      fileId: 'same',
      openedAt: Date.now(),
    });
    expect(result.filter((resource) => resource.id === 'local-file:same')).toHaveLength(1);
  });

  it('sorts mixed resources by explicit-open time when loading', async () => {
    installStorage({
      version: 1,
      items: [
        { id: 'workspace:a', title: 'A', kind: 'workspace', workspaceId: 'a', openedAt: 1 },
        { id: 'remote:b', title: 'B', kind: 'remote', url: 'https://example.com/b.md', openedAt: 3 },
        { id: 'remote:b', title: 'Stale B', kind: 'remote', url: 'https://example.com/old-b.md', openedAt: 0 },
        { id: 'local-file:c', title: 'C', kind: 'local-file', fileId: 'c', openedAt: 2 },
      ],
    });

    await expect(loadRecentResources()).resolves.toMatchObject([{ title: 'B' }, { title: 'C' }, { title: 'A' }]);
  });

  it('updates a workspace last document without changing openedAt or order', async () => {
    const { set } = installStorage({
      version: 1,
      items: [
        { id: 'workspace:a', title: 'A', kind: 'workspace', workspaceId: 'a', lastFilePath: 'README.md', openedAt: 9 },
        { id: 'workspace:b', title: 'B', kind: 'workspace', workspaceId: 'b', openedAt: 5 },
      ],
    });

    const result = await updateRecentWorkspaceDocument('a', 'docs/design.md');

    expect(result).toEqual([
      {
        id: 'workspace:a',
        title: 'A',
        kind: 'workspace',
        workspaceId: 'a',
        lastFilePath: 'docs/design.md',
        openedAt: 9,
      },
      { id: 'workspace:b', title: 'B', kind: 'workspace', workspaceId: 'b', openedAt: 5 },
    ]);
    expect(set).toHaveBeenCalledOnce();
  });

  it('does not create a workspace resource from internal navigation', async () => {
    const { set } = installStorage();

    await expect(updateRecentWorkspaceDocument('missing', 'README.md')).resolves.toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });

  it('removes only the selected resource', async () => {
    installStorage({
      version: 1,
      items: [
        { id: 'local-file:a', title: 'A', kind: 'local-file', fileId: 'a', openedAt: 2 },
        { id: 'local-file:b', title: 'B', kind: 'local-file', fileId: 'b', openedAt: 1 },
      ],
    });

    await expect(removeRecentResource('local-file:a')).resolves.toMatchObject([{ id: 'local-file:b' }]);
  });

  it('treats malformed or unavailable storage as empty and ignores write failures', async () => {
    installStorage('malformed');
    await expect(loadRecentResources()).resolves.toEqual([]);

    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(async () => ({ 'recent-resources': { version: 1, items: [] } })),
          set: vi.fn(async () => {
            throw new Error('quota exceeded');
          }),
        },
      },
    });
    await expect(
      rememberRecentResource({
        id: 'remote:https://example.com/a.md',
        title: 'A',
        kind: 'remote',
        url: 'https://example.com/a.md',
      }),
    ).resolves.toHaveLength(1);

    vi.stubGlobal('browser', undefined);
    await expect(loadRecentResources()).resolves.toEqual([]);
  });
});
