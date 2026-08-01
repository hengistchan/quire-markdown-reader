import { describe, expect, it, vi } from 'vitest';
import { createFileDocumentSource, createImportedDocumentSource, createRemoteDocumentSource } from './documentSources';

function workspaceFile(markdown = '# Local', lastModified = 42) {
  const handle = {
    kind: 'file', name: 'Local.md',
    getFile: async () => ({ text: async () => markdown, lastModified }) as File,
  } as FileSystemFileHandle;
  return { id: 'Local.md', name: 'Local.md', path: 'Local.md', depth: 0, handle };
}

describe('DocumentSourceAdapter', () => {
  it('loads imported and local files through the same snapshot contract', async () => {
    await expect(createImportedDocumentSource({ title: 'Imported.md', markdown: '# Imported' }).load())
      .resolves.toEqual({ title: 'Imported.md', markdown: '# Imported' });
    await expect(createFileDocumentSource(workspaceFile(), 'file').load())
      .resolves.toEqual({ title: 'Local.md', markdown: '# Local', lastModified: 42 });
  });

  it('reports unchanged local refreshes and honors cancellation', async () => {
    const source = createFileDocumentSource(workspaceFile(), 'workspace');
    const previous = await source.load();
    await expect(source.refresh?.(previous)).resolves.toEqual({ changed: false, snapshot: previous });
    const controller = new AbortController();
    controller.abort();
    await expect(source.load(controller.signal)).rejects.toHaveProperty('name', 'AbortError');
  });

  it('loads and conditionally refreshes a remote document', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('# Remote', { headers: { etag: 'v1' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const source = createRemoteDocumentSource('https://example.com/Remote.md', fetcher);
    const snapshot = await source.load();
    expect(snapshot).toMatchObject({ title: 'Remote.md', markdown: '# Remote', remoteState: { etag: 'v1' } });
    await expect(source.refresh?.(snapshot)).resolves.toEqual({ changed: false, snapshot });
  });
});
