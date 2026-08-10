import { describe, expect, it, vi } from 'vitest';
import type { RecentResourceRepository } from '../ports/recentResourceRepository';
import { normalizeRecentRemoteUrl, RecentResourceService } from './recentResourceService';

function repository(): RecentResourceRepository {
  return {
    list: vi.fn(async () => []),
    put: vi.fn(async () => []),
    remove: vi.fn(async () => []),
    updateWorkspaceDocument: vi.fn(async () => []),
  };
}

describe('RecentResourceService', () => {
  it('normalizes empty fragments and default ports without removing query parameters', () => {
    expect(normalizeRecentRemoteUrl('https://example.com:443/readme.md?branch=main#')).toBe(
      'https://example.com/readme.md?branch=main',
    );
  });

  it('keeps the last good snapshot when optional persistence fails', async () => {
    const resources = [{
      id: 'local-file:file-a',
      title: 'A.md',
      kind: 'local-file' as const,
      fileId: 'file-a',
      openedAt: 1,
    }];
    const port = repository();
    vi.mocked(port.list).mockResolvedValue(resources);
    vi.mocked(port.put).mockRejectedValue(new Error('storage unavailable'));
    vi.mocked(port.remove).mockRejectedValue(new Error('storage unavailable'));
    vi.mocked(port.updateWorkspaceDocument).mockRejectedValue(new Error('storage unavailable'));
    const service = new RecentResourceService(port);

    await expect(service.list()).resolves.toEqual(resources);
    await expect(service.remember({
      id: 'remote:https://example.com/a.md',
      title: 'A',
      kind: 'remote',
      url: 'https://example.com/a.md',
    })).resolves.toEqual(resources);
    await expect(service.remove(resources[0]!.id)).resolves.toEqual(resources);
    await expect(service.updateWorkspaceDocument('workspace-a', 'docs/a.md')).resolves.toEqual(resources);
  });
});
