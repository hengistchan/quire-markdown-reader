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
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('browser', { storage: { local: { get: vi.fn(async () => ({ 'recent-documents': existing })), set } } });

    const result = await rememberRecentItem({ id: 'same', title: 'Updated', kind: 'remote', url: 'https://example.com/new.md' });

    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({
      id: 'same', title: 'Updated', kind: 'remote', url: 'https://example.com/new.md', openedAt: Date.now(),
    });
    expect(result.filter((item) => item.id === 'same')).toHaveLength(1);
    expect(set).toHaveBeenCalledWith({ 'recent-documents': result });
    vi.useRealTimers();
  });

  it('treats malformed or unavailable storage as empty', async () => {
    vi.stubGlobal('browser', { storage: { local: { get: vi.fn(async () => ({ 'recent-documents': 'bad' })) } } });
    await expect(loadRecentItems()).resolves.toEqual([]);
    vi.stubGlobal('browser', undefined);
    await expect(loadRecentItems()).resolves.toEqual([]);
  });
});
