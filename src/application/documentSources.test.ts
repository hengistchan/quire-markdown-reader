import { describe, expect, it, vi } from 'vitest';
import { createFileDocumentSource, createImportedDocumentSource, createRemoteDocumentSource } from './documentSources';

function workspaceFile(markdown = '# Local', lastModified = 42, size = markdown.length, text = vi.fn(async () => markdown)) {
  const handle = {
    kind: 'file', name: 'Local.md',
    getFile: async () => ({ text, lastModified, size }) as unknown as File,
  } as FileSystemFileHandle;
  return { file: { id: 'Local.md', name: 'Local.md', path: 'Local.md', depth: 0, handle }, text };
}

describe('DocumentSourceAdapter', () => {
  it('loads imported and local files through the same snapshot contract', async () => {
    await expect(createImportedDocumentSource({ title: 'Imported.md', markdown: '# Imported' }).load())
      .resolves.toEqual({ title: 'Imported.md', markdown: '# Imported' });
    await expect(createFileDocumentSource(workspaceFile().file, 'file').load())
      .resolves.toEqual({ title: 'Local.md', markdown: '# Local', lastModified: 42, size: 7 });
  });

  it('reports unchanged local refreshes and honors cancellation', async () => {
    const fixture = workspaceFile();
    const source = createFileDocumentSource(fixture.file, 'workspace');
    const previous = await source.load();
    await expect(source.refresh?.(previous)).resolves.toEqual({ changed: false, snapshot: previous });
    expect(fixture.text).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    await expect(source.load(controller.signal)).rejects.toHaveProperty('name', 'AbortError');
  });

  it.each([
    { label: 'lastModified', lastModified: 43, size: 7 },
    { label: 'size', lastModified: 42, size: 8 },
  ])('reads content when local $label changes', async ({ lastModified, size }) => {
    const initial = workspaceFile('# Local', 42, 7);
    const source = createFileDocumentSource(initial.file, 'file');
    const previous = await source.load();
    const updatedText = vi.fn(async () => '# Updated');
    initial.file.handle.getFile = vi.fn(async () => ({ lastModified, size, text: updatedText }) as unknown as File);

    await expect(source.refresh?.(previous)).resolves.toMatchObject({
      changed: true,
      snapshot: { markdown: '# Updated', lastModified, size },
    });
    expect(updatedText).toHaveBeenCalledOnce();
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
