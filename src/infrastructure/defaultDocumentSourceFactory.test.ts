import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefaultDocumentSourceFactory } from './defaultDocumentSourceFactory';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function workspaceFile(markdown = '# Local', lastModified = 42, size = markdown.length, text = vi.fn(async () => markdown)) {
  const handle = {
    kind: 'file', name: 'Local.md',
    getFile: async () => ({ text, lastModified, size }) as unknown as File,
  } as FileSystemFileHandle;
  return { file: { id: 'Local.md', name: 'Local.md', path: 'Local.md', depth: 0, handle }, text };
}

describe('DefaultDocumentSourceFactory', () => {
  it('loads imported and local files through the same snapshot contract', async () => {
    const factory = new DefaultDocumentSourceFactory();
    await expect(factory.createImported({ title: 'Imported.md', markdown: '# Imported' }).load())
      .resolves.toMatchObject({ title: 'Imported.md', markdown: '# Imported', format: 'markdown' });
    await expect(factory.createLocalFile(workspaceFile().file).load())
      .resolves.toMatchObject({ title: 'Local.md', markdown: '# Local', metadata: { lastModified: 42, size: 7 } });
  });

  it('reports unchanged local refreshes and honors cancellation', async () => {
    const fixture = workspaceFile();
    const source = new DefaultDocumentSourceFactory().createWorkspaceFile({
      id: 'workspace', name: 'docs', files: [fixture.file], tree: [], handle: {} as FileSystemDirectoryHandle,
    }, fixture.file);
    const previous = await source.load();
    await expect(source.refresh(previous)).resolves.toEqual({ changed: false, snapshot: previous });
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
    const source = new DefaultDocumentSourceFactory().createLocalFile(initial.file);
    const previous = await source.load();
    const updatedText = vi.fn(async () => '# Updated');
    initial.file.handle.getFile = vi.fn(async () => ({ lastModified, size, text: updatedText }) as unknown as File);

    await expect(source.refresh(previous)).resolves.toMatchObject({
      changed: true,
      snapshot: { markdown: '# Updated', metadata: { lastModified, size } },
    });
    expect(updatedText).toHaveBeenCalledOnce();
  });

  it('loads and conditionally refreshes a remote document', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('# Remote', { headers: { etag: 'v1' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const source = new DefaultDocumentSourceFactory(fetcher).createRemote('https://example.com/Remote.md');
    const snapshot = await source.load();
    expect(snapshot).toMatchObject({ title: 'Remote.md', markdown: '# Remote', remoteState: { etag: 'v1' } });
    await expect(source.refresh(snapshot)).resolves.toMatchObject({ changed: false, snapshot });
  });

  it('owns workspace asset URLs and relative document-link resolution until disposal', async () => {
    const imageHandle = {
      kind: 'file', name: 'image.png', getFile: vi.fn(async () => ({ name: 'image.png' } as File)),
    } as unknown as FileSystemFileHandle;
    const root = {
      kind: 'directory', name: 'docs', getFileHandle: vi.fn(async () => imageHandle),
    } as unknown as FileSystemDirectoryHandle;
    const fixture = workspaceFile();
    fixture.file.path = 'guide/Local.md';
    const workspace = { id: 'docs', name: 'docs', files: [fixture.file], tree: [], handle: root };
    const createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const revokeObjectURL = vi.fn();
    class TestURL extends URL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    }
    vi.stubGlobal('URL', TestURL);
    const source = new DefaultDocumentSourceFactory().createWorkspaceFile(workspace, fixture.file);

    await expect(source.resolveAsset('../image.png')).resolves.toMatchObject({ type: 'object-url', url: 'blob:first' });
    await expect(source.resolveAsset('../image.png')).resolves.toMatchObject({ type: 'object-url', url: 'blob:second' });
    expect(source.resolveLink('../README.md#start')).toEqual({
      type: 'workspace-document', path: 'README.md', fragment: 'start',
    });
    source.dispose();

    expect(revokeObjectURL.mock.calls).toEqual([['blob:first'], ['blob:second']]);
  });
});
