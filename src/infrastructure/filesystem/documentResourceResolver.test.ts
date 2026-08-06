import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceFile, WorkspaceSnapshot } from '../../shared/types';
import { createDocumentResourceResolver } from './documentResourceResolver';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workspace document resource lifecycle', () => {
  it('revokes every object URL when the resolver is disposed', async () => {
    const image = { kind: 'file', name: 'image.png', getFile: vi.fn(async () => ({ name: 'image.png' } as File)) } as unknown as FileSystemFileHandle;
    const root = {
      kind: 'directory',
      name: 'docs',
      getFileHandle: vi.fn(async () => image),
    } as unknown as FileSystemDirectoryHandle;
    const activeFile = { id: 'README.md', name: 'README.md', path: 'README.md', depth: 0, handle: image } satisfies WorkspaceFile;
    const workspace = { name: 'docs', files: [activeFile], tree: [], handle: root } satisfies WorkspaceSnapshot;
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second');
    const revoke = vi.fn();
    class TestURL extends URL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revoke;
    }
    vi.stubGlobal('URL', TestURL);
    const resolver = createDocumentResourceResolver({ workspace, activeFile });

    await expect(resolver.resolveAsset('first.png')).resolves.toMatchObject({ type: 'object-url', url: 'blob:first' });
    await expect(resolver.resolveAsset('second.png')).resolves.toMatchObject({ type: 'object-url', url: 'blob:second' });
    resolver.dispose();

    expect(revoke.mock.calls).toEqual([['blob:first'], ['blob:second']]);
  });
});
