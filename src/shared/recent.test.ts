import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRecentItems, rememberRecentItem } from './recent';

describe('recent documents', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('deduplicates, timestamps, caps, and persists recent documents', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'));
    const existing = Array.from({ length: 6 }, (_, index) => ({
      id: index ? `old-${index}` : 'same',
      title: `Old ${index}`,
      kind: 'remote' as const,
      url: `https://example.com/${index}.md`,
      openedAt: index,
    }));
    const set = vi.fn(async (_value?: unknown) => undefined);
    vi.stubGlobal('browser', { storage: { local: { get: vi.fn(async () => ({ 'recent-documents': existing })), set } } });

    const result = await rememberRecentItem({ id: 'same', title: 'Updated', kind: 'remote', url: 'https://example.com/new.md' });

    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({
      id: 'same', title: 'Updated', kind: 'remote', url: 'https://example.com/new.md', openedAt: Date.now(),
    });
    expect(result.filter((item) => item.id === 'same')).toHaveLength(1);
    expect(set).toHaveBeenLastCalledWith({ 'recent-documents': { version: 2, items: result } });
    vi.useRealTimers();
  });

  it('keeps separately restorable workspace and local-file identities', async () => {
    const set = vi.fn(async (_value?: unknown) => undefined);
    let stored: unknown = { version: 2, items: [] };
    vi.stubGlobal('browser', { storage: { local: {
      get: vi.fn(async () => ({ 'recent-documents': stored })),
      set: vi.fn(async (value: Record<string, unknown>) => { stored = value['recent-documents']; await set(value); }),
    } } });

    await rememberRecentItem({ id: 'workspace:a:README.md', title: 'README.md', kind: 'workspace-file', workspaceId: 'a', filePath: 'README.md' });
    const result = await rememberRecentItem({ id: 'file:b', title: 'README.md', kind: 'local-file', fileId: 'b' });

    expect(result).toMatchObject([
      { kind: 'local-file', fileId: 'b' },
      { kind: 'workspace-file', workspaceId: 'a', filePath: 'README.md' },
    ]);
  });

  it('treats malformed or unavailable storage as empty', async () => {
    vi.stubGlobal('browser', { storage: { local: { get: vi.fn(async () => ({ 'recent-documents': 'bad' })) } } });
    await expect(loadRecentItems()).resolves.toEqual([]);
    vi.stubGlobal('browser', undefined);
    await expect(loadRecentItems()).resolves.toEqual([]);
  });
});
